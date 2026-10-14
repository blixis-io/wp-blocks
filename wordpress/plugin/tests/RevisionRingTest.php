<?php
/**
 * Revision ring tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Rest\DocumentRequest;
use Blixis\Builder\Rest\FakePostAccess;
use Blixis\Builder\Storage\FakeDatabase;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\RevisionContext;
use Blixis\Builder\Storage\RevisionRing;
use Blixis\Builder\Storage\StreamStore;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
require_once __DIR__ . '/FakePostAccess.php';
Autoloader::register();

/** History is bounded, append-only and per stream; restore is an ordinary write. */
final class RevisionRingTest extends TestCase {
	/**
	 * In-memory storage.
	 *
	 * @var FakeDatabase
	 */
	private FakeDatabase $database;

	/**
	 * Store with a ring.
	 *
	 * @var StreamStore
	 */
	private StreamStore $store;

	/**
	 * Ring under test.
	 *
	 * @var RevisionRing
	 */
	private RevisionRing $ring;

	/** Fresh storage with a fixed actor and clock. */
	protected function setUp(): void {
		$this->database = new FakeDatabase();
		$context        = new class() implements RevisionContext {
			/**
			 * Fixed user.
			 *
			 * @return int
			 */
			public function user_id(): int {
				return 7;
			}

			/**
			 * Fixed time.
			 *
			 * @return string
			 */
			public function now(): string {
				return '2026-01-01T00:00:00Z';
			}
		};
		$this->ring     = new RevisionRing( $this->database, $context );
		$this->store    = new StreamStore( $this->database, null, $this->ring );
	}

	/**
	 * A layout envelope with a note.
	 *
	 * @param string $note Marker text.
	 */
	private function layout( string $note ): string {
		return (string) \json_encode(
			[
				'schemaVersion'  => 1,
				'layoutRevision' => 1,
				'note'           => $note,
			]
		);
	}

	/** Keys of the history rows are valid, distinct per stream and never snapshots. */
	public function test_keys(): void {
		$this->assertSame( '_blixis_rev_layout_3', MetaKeys::rev( MetaKeys::LAYOUT, 3 ) );
		$this->assertSame( '_blixis_rev_content_nl_NL_3', MetaKeys::rev( MetaKeys::content( 'nl_NL' ), 3 ) );
		$this->assertTrue( MetaKeys::is_revision( '_blixis_rev_layout_3' ) );
		$this->assertTrue( MetaKeys::is_valid_key( '_blixis_rev_content_nl_NL_3' ) );
		$this->assertFalse( MetaKeys::is_snapshot( '_blixis_rev_layout_3' ) );
		foreach ( [ '_blixis_rev_layout_0', '_blixis_rev_layout_03', '_blixis_rev_content_NL;x_1', '_blixis_rev_published_1', '_blixis_rev_layout_' ] as $bad ) {
			$this->assertFalse( MetaKeys::is_valid_key( $bad ), $bad );
		}
		foreach ( [ MetaKeys::PUBLISHED, MetaKeys::snap_layout( 1 ), '_blixis_rev_layout_1' ] as $not_a_stream ) {
			try {
				MetaKeys::rev( $not_a_stream, 1 );
				$this->fail( 'accepted ' . $not_a_stream );
			} catch ( \InvalidArgumentException $error ) {
				$this->assertSame( 'Invalid revision key.', $error->getMessage() );
			}
		}
	}

	/** A write keeps the value it replaced, with author and time; the first write keeps nothing. */
	public function test_each_write_keeps_the_replaced_value(): void {
		$this->assertTrue( $this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'one' ), 0 )->success );
		$this->assertSame( [], $this->ring->list( 5, MetaKeys::LAYOUT ) );
		$this->assertTrue( $this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'two' ), 1 )->success );
		$this->assertTrue( $this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'three' ), 2 )->success );
		$this->assertSame(
			[
				[
					'revision' => 2,
					'savedAt'  => '2026-01-01T00:00:00Z',
					'author'   => 7,
				],
				[
					'revision' => 1,
					'savedAt'  => '2026-01-01T00:00:00Z',
					'author'   => 7,
				],
			],
			$this->ring->list( 5, MetaKeys::LAYOUT )
		);
		$this->assertStringContainsString( '"note":"one"', (string) $this->ring->fetch( 5, MetaKeys::LAYOUT, 1 ) );
		$this->assertNull( $this->ring->fetch( 5, MetaKeys::LAYOUT, 9 ) );
		$this->assertNull( $this->ring->fetch( 5, MetaKeys::LAYOUT, 0 ) );
	}

	/** A conflicting write keeps no history. */
	public function test_conflict_records_nothing(): void {
		$this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'one' ), 0 );
		$this->assertFalse( $this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'x' ), 0 )->success );
		$this->assertSame( [], $this->ring->list( 5, MetaKeys::LAYOUT ) );
	}

	/** Only the newest 20 survive, oldest pruned first, and streams do not share a ring. */
	public function test_bounded_and_per_stream(): void {
		$content = (string) \json_encode(
			[
				'schemaVersion'   => 1,
				'contentRevision' => 1,
			]
		);
		$this->store->write( 5, MetaKeys::content( 'nl_NL' ), $content, 0 );
		$this->store->write( 5, MetaKeys::content( 'nl_NL' ), $content, 1 );
		$this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'start' ), 0 );
		for ( $revision = 1; $revision <= 25; $revision++ ) {
			$this->assertTrue( $this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'n' . $revision ), $revision )->success );
		}
		$history = $this->ring->list( 5, MetaKeys::LAYOUT );
		$this->assertCount( RevisionRing::LIMIT, $history );
		$this->assertSame( 25, $history[0]['revision'] );
		$this->assertSame( 6, $history[ RevisionRing::LIMIT - 1 ]['revision'] );
		$this->assertNull( $this->ring->fetch( 5, MetaKeys::LAYOUT, 5 ) );
		$this->assertCount( 1, $this->ring->list( 5, MetaKeys::content( 'nl_NL' ) ) );
	}

	/** Restoring is a normal write of an old value: append-only, undoable and conflict-checked. */
	public function test_restore_is_an_ordinary_write(): void {
		$this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'one' ), 0 );
		$this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'two' ), 1 );
		$old = $this->ring->fetch( 5, MetaKeys::LAYOUT, 1 );
		$this->assertNotNull( $old );
		$this->assertFalse( $this->store->write( 5, MetaKeys::LAYOUT, $old, 1 )->success, 'stale expectation conflicts' );
		$restored = $this->store->write( 5, MetaKeys::LAYOUT, $old, 2 );
		$this->assertTrue( $restored->success );
		$this->assertSame( 3, $restored->revision );
		$this->assertStringContainsString( '"note":"one"', (string) ( $this->store->read( 5, MetaKeys::LAYOUT )['value'] ?? '' ) );
		$this->assertStringContainsString( '"note":"two"', (string) $this->ring->fetch( 5, MetaKeys::LAYOUT, 2 ), 'the restored-over value stays recoverable' );
	}

	/** A broken history row is skipped, never an error. */
	public function test_corrupt_history_is_ignored(): void {
		$this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'one' ), 0 );
		$this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'two' ), 1 );
		$this->database->insert( 5, MetaKeys::rev( MetaKeys::LAYOUT, 9 ), 'not json' );
		$this->assertCount( 1, $this->ring->list( 5, MetaKeys::LAYOUT ) );
		$this->assertNull( $this->ring->fetch( 5, MetaKeys::LAYOUT, 9 ) );
	}
	/** The REST policy: listing, restore preconditions and error codes. */
	public function test_request_policy(): void {
		$this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'one' ), 0 );
		$this->store->write( 5, MetaKeys::LAYOUT, $this->layout( 'two' ), 1 );
		$request = new DocumentRequest( $this->store, new FakePostAccess(), $this->ring );
		$list    = $request->revisions( 5, null );
		$this->assertSame( 200, $list->status );
		$this->assertSame( 2, $list->body['current'] );
		$this->assertCount( 1, $list->body['revisions'] );
		$this->assertSame( 400, $request->revisions( 5, 'NL;x' )->status );
		$this->assertSame( 428, $request->restore( 5, null, null, '{"revision":1}' )->status );
		$this->assertSame( 400, $request->restore( 5, null, 'abc', '{"revision":1}' )->status );
		foreach ( [ '{}', '{"revision":0}', '{"revision":"1"}', '{"revision":1,"x":2}', 'not json', '[1]' ] as $bad ) {
			$this->assertSame( 422, $request->restore( 5, null, '"2"', $bad )->status, $bad );
		}
		$this->assertSame( 404, $request->restore( 5, null, '"2"', '{"revision":9}' )->status );
		$this->assertSame( 409, $request->restore( 5, null, '"1"', '{"revision":1}' )->status );
		$done = $request->restore( 5, null, '"2"', '{"revision":1}' );
		$this->assertSame( 200, $done->status );
		$this->assertSame( 3, $done->revision );
	}
}
