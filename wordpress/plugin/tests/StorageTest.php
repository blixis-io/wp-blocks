<?php
/**
 * Pure storage contract tests for BWB-040.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();
require_once __DIR__ . '/FakeDatabase.php';

/** Key, envelope, CAS and recovery cases. */
final class StorageTest extends TestCase {
	/** Fake postmeta database.
	 *
	 * @var FakeDatabase
	 */
	private FakeDatabase $database;
	/** Working-stream repository.
	 *
	 * @var StreamStore
	 */
	private StreamStore $streams;
	/** Publication repository.
	 *
	 * @var SnapshotStore
	 */
	private SnapshotStore $snapshots;

	/**
	 * Initialize isolated fake storage.
	 */
	protected function setUp(): void {
		$this->database  = new FakeDatabase();
		$this->streams   = new StreamStore( $this->database );
		$this->snapshots = new SnapshotStore( $this->database, $this->streams );
	}

	/**
	 * Representative hostile keys and canonical keys.
	 */
	public function test_key_grammar(): void {
		foreach ( [ MetaKeys::LAYOUT, MetaKeys::PUBLISHED, MetaKeys::content( 'nl_NL' ), MetaKeys::snap_layout( 1 ), MetaKeys::snap_content( 'en_US', 12 ) ] as $key ) {
			$this->assertTrue( MetaKeys::is_valid_key( $key ), $key );
		}
		foreach ( [ '_blixis_content_../x', '_blixis_content_NL_nl', '_blixis_content_' . \str_repeat( 'a', 21 ), '_blixis_content___proto__', '_blixis_content_en_US;DROP', '_blixis_snap_layout_0', '_blixis_snap_layout_01', '_blixis_snap_content_nl_NL_0' ] as $key ) {
			$this->assertFalse( MetaKeys::is_valid_key( $key ), $key );
		}
	}

	/**
	 * The first layer checks only JSON envelope shape and limits.
	 */
	public function test_envelope_validation(): void {
		$good = '{"schemaVersion":1,"layoutRevision":1,"unknown":{"x":2}}';
		$this->assertSame( 1, Envelope::revision( $good, MetaKeys::LAYOUT ) );
		foreach ( [ '[]', '{', '{"schemaVersion":"1","layoutRevision":1}', '{"schemaVersion":1}', '{"schemaVersion":1,"layoutRevision":0}', '{"schemaVersion":1,"layoutRevision":1.2}', \str_repeat( ' ', Envelope::MAX_BYTES + 1 ), '{"schemaVersion":1,"layoutRevision":1,"nested":' . \str_repeat( '[', 33 ) . '0' . \str_repeat( ']', 33 ) . '}' ] as $bad ) {
			$this->assertNull( Envelope::decode( $bad, MetaKeys::LAYOUT ) );
		}
		$this->assertNull( Envelope::decode( $good, MetaKeys::content( 'nl_NL' ) ) );
	}

	/**
	 * Two stale writers conflict while locale rows remain independent.
	 */
	public function test_stream_cas_and_independence(): void {
		$layout = '{"schemaVersion":1,"layoutRevision":1,"root":[]}';
		$first  = $this->streams->write( 7, MetaKeys::LAYOUT, $layout, 0 );
		$this->assertTrue( $first->success );
		$this->assertSame( 1, $first->revision );
		$this->assertSame( 1, $this->streams->write( 7, MetaKeys::LAYOUT, $layout, 0 )->revision );
		$this->assertTrue( $this->streams->write( 7, MetaKeys::LAYOUT, $layout, 1 )->success );
		$stale = $this->streams->write( 7, MetaKeys::LAYOUT, $layout, 1 );
		$this->assertFalse( $stale->success );
		$this->assertSame( 2, $stale->revision );
		$this->assertSame( 1, $stale->expected_revision );
		$this->assertSame( 2, $this->streams->read( 7, MetaKeys::LAYOUT )['revision'] ?? null );
		$content = '{"schemaVersion":1,"contentRevision":1}';
		$this->assertTrue( $this->streams->write( 7, MetaKeys::content( 'en_US' ), $content, 0 )->success );
		$this->assertTrue( $this->streams->write( 7, MetaKeys::content( 'nl_NL' ), $content, 0 )->success );
		$this->assertSame( 2, $this->streams->read( 7, MetaKeys::LAYOUT )['revision'] ?? null );
	}

	/**
	 * A duplicate row is never silently selected.
	 */
	public function test_duplicate_rows_fail_closed(): void {
		$value = '{"schemaVersion":1,"layoutRevision":1}';
		$this->database->insert( 3, MetaKeys::LAYOUT, $value );
		$this->database->insert( 3, MetaKeys::LAYOUT, $value );
		$this->expectException( \RuntimeException::class );
		$this->streams->read( 3, MetaKeys::LAYOUT );
	}

	/**
	 * A crash before pointer CAS leaves an orphan that can be collected.
	 */
	public function test_interrupted_publish_and_immutable_snapshot(): void {
		$key                                 = MetaKeys::snap_layout( 1 );
		$value                               = '{"schemaVersion":1,"layoutRevision":1}';
		$pointer                             = '{"schemaVersion":1,"pointerRevision":1,"publishedLayoutRevision":1}';
		$this->database->fail_pointer_insert = true;
		try {
			$this->snapshots->publish( 9, $key, $value, 0, $pointer );
			$this->fail( 'Expected interruption.' );
		} catch ( \RuntimeException $exception ) {
			$this->assertSame( 'Injected interruption.', $exception->getMessage() );
		}
		$this->assertNull( $this->streams->read( 9, MetaKeys::PUBLISHED ) );
		$this->assertSame( [ $key ], $this->database->snapshot_keys( 9 ) );
		$this->assertSame( [ $key ], $this->snapshots->collect( 9, '' ) );
		$this->database->fail_pointer_insert = false;
		$this->assertTrue( $this->snapshots->publish( 9, $key, $value, 0, $pointer )->success );
		$this->assertSame( [], $this->snapshots->unreferenced( 9, $this->streams->read( 9, MetaKeys::PUBLISHED )['value'] ?? '' ) );
		$this->expectException( \RuntimeException::class );
		$this->snapshots->publish( 9, $key, $value, 1, $pointer );
	}

	/** The collector retains pinned layout, locale and source snapshots. */
	public function test_orphan_collection_preserves_all_pointer_references(): void {
		$pointer = '{"schemaVersion":1,"pointerRevision":1,"publishedLayoutRevision":2,"defaultLocale":"en_US","locales":{"nl_NL":{"contentSnapshot":4,"baseLayout":1,"sourceContentRevision":3}}}';
		$this->streams->write( 6, MetaKeys::PUBLISHED, $pointer, 0 );
		$protected = [ MetaKeys::snap_layout( 1 ), MetaKeys::snap_layout( 2 ), MetaKeys::snap_content( 'nl_NL', 4 ), MetaKeys::snap_content( 'en_US', 3 ) ];
		foreach ( $protected as $key ) {
			$this->database->insert( 6, $key, '{}' );
		}
		$orphan = MetaKeys::snap_layout( 5 );
		$this->database->insert( 6, $orphan, '{}' );
		$stored = $this->streams->read( 6, MetaKeys::PUBLISHED )['value'] ?? '';
		$this->assertSame( [ $orphan ], $this->snapshots->unreferenced( 6, $stored ) );
		$this->assertSame( [ $orphan ], $this->snapshots->collect( 6, $stored ) );
		$this->assertSame( $protected, $this->database->snapshot_keys( 6 ) );
	}

	/** Collection never deletes retained history while the pointer is an unpublished tombstone. */
	public function test_orphan_collection_preserves_snapshots_for_tombstone_pointer(): void {
		$key = MetaKeys::snap_layout( 1 );
		$this->database->insert( 8, $key, '{}' );
		$pointer = '{"schemaVersion":1,"pointerRevision":1,"defaultLocale":"en_US","locales":{"en_US":{}}}';
		$this->assertTrue( $this->streams->write( 8, MetaKeys::PUBLISHED, $pointer, 0 )->success );
		$stored = $this->streams->read( 8, MetaKeys::PUBLISHED )['value'] ?? '';
		$this->assertSame( [], $this->snapshots->collect( 8, $stored ) );
		$this->assertSame( [ $key ], $this->database->snapshot_keys( 8 ) );
	}
}
