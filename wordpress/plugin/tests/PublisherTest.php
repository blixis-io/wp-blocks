<?php
/**
 * Publish and rollback tests (ADR 0004 test strategy).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Frontend\PublishedReader;
use Blixis\Builder\Publication\PublishOptions;
use Blixis\Builder\Publication\Publisher;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Storage\FakeDatabase;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\SnapshotStore;
use Blixis\Builder\Storage\StreamStore;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Locale and layout publication move one pointer atomically and never publish working data by accident. */
final class PublisherTest extends TestCase {
	/**
	 * Storage.
	 *
	 * @var FakeDatabase
	 */
	private FakeDatabase $database;

	/**
	 * Working streams.
	 *
	 * @var StreamStore
	 */
	private StreamStore $streams;

	/**
	 * Publisher under test.
	 *
	 * @var Publisher
	 */
	private Publisher $publisher;

	/** Fresh storage. */
	protected function setUp(): void {
		$this->database  = new FakeDatabase();
		$this->streams   = new StreamStore( $this->database );
		$this->publisher = new Publisher( $this->database, $this->streams, new SnapshotStore( $this->database, $this->streams ), ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ) );
	}

	/**
	 * Save the working layout.
	 *
	 * @param array<string> $ids Element ids (headings), in order.
	 * @param int           $expected Expected stream revision.
	 */
	private function save_layout( array $ids, int $expected ): void {
		$root = [];
		foreach ( $ids as $id ) {
			$root[] = [
				'id'       => $id,
				'type'     => 'blixis/heading',
				'props'    => new \stdClass(),
				'children' => [],
			];
		}
		$this->assertTrue(
			$this->streams->write(
				5,
				MetaKeys::LAYOUT,
				(string) \json_encode(
					[
						'schemaVersion'  => 1,
						'documentId'     => 'doc-001',
						'layoutRevision' => 1,
						'root'           => $root,
					]
				),
				$expected
			)->success
		);
	}

	/**
	 * Save working content of a locale.
	 *
	 * @param string               $locale Locale.
	 * @param array<string,string> $texts Element id to heading text.
	 * @param int                  $expected Expected stream revision.
	 */
	private function save_content( string $locale, array $texts, int $expected ): void {
		$entries = [];
		foreach ( $texts as $id => $text ) {
			$entries[ $id ] = [
				'status' => 'translated',
				'values' => [ 'text' => $text ],
			];
		}
		$this->assertTrue(
			$this->streams->write(
				5,
				MetaKeys::content( $locale ),
				(string) \json_encode(
					[
						'schemaVersion'   => 1,
						'contentRevision' => 1,
						'entries'         => (object) $entries,
					]
				),
				$expected
			)->success
		);
	}

	/**
	 * Publish with options.
	 *
	 * @param int     $pointer Expected pointer revision.
	 * @param bool    $layout Publish the layout.
	 * @param ?string $locale Locale.
	 * @param bool    $confirm Confirm impact.
	 * @param bool    $exclude Exclude incompatible entries.
	 */
	private function publish( int $pointer, bool $layout, ?string $locale, bool $confirm = false, bool $exclude = false ): \Blixis\Builder\Publication\PublishResult {
		return $this->publisher->publish( 5, new PublishOptions( $pointer, $layout, $locale, $confirm, $exclude, null, null, 'en_US' ) );
	}

	/**
	 * What a visitor of a locale gets, as comparable JSON.
	 *
	 * @param string $locale Locale.
	 */
	private function live( string $locale ): string {
		$published = ( new PublishedReader( $this->database ) )->read( 5, $locale );
		return null === $published ? 'none' : (string) \json_encode( [ $published->document, $published->locale, $published->layout_revision, $published->content_revision ] );
	}

	/** A first publication of layout and English content makes the page live; nothing is live before. */
	public function test_first_publication(): void {
		$this->save_layout( [ 'hed-1', 'hed-2' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->assertSame( 'none', $this->live( 'en_US' ), 'working data is not live' );
		$result = $this->publish( 0, true, 'en_US' );
		$this->assertNull( $result->code );
		$this->assertSame( 1, $result->data['pointerRevision'] );
		$this->assertStringContainsString( 'Hello', $this->live( 'en_US' ) );
		$status = $this->publisher->status( 5 );
		$this->assertSame( 'published', $status['layout']['state'] );
		$this->assertSame( 'published', $status['locales']['en_US']['state'] );
	}

	/** Publishing Dutch with pending English edits leaves English live output byte-identical. */
	public function test_publishing_dutch_does_not_publish_pending_english(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->publish( 0, true, 'en_US' );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello EDITED' ], 1 );
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Hallo' ], 0 );
		$before = $this->live( 'en_US' );
		$result = $this->publish( 1, false, 'nl_NL' );
		$this->assertNull( $result->code );
		$this->assertSame( $before, $this->live( 'en_US' ) );
		$this->assertStringContainsString( 'Hallo', $this->live( 'nl_NL' ) );
		$this->assertSame( 'published-with-pending-changes', $this->publisher->status( 5 )['locales']['en_US']['state'] );
	}

	/** Dutch published while the layout has unpublished changes uses the published layout. */
	public function test_locale_uses_the_published_layout(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->publish( 0, true, 'en_US' );
		$this->save_layout( [ 'hed-1', 'hed-2' ], 1 );
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Hallo' ], 0 );
		$this->assertNull( $this->publish( 1, false, 'nl_NL' )->code );
		$this->assertStringNotContainsString( 'hed-2', $this->live( 'nl_NL' ) );
		$this->assertSame( 'published-with-pending-changes', $this->publisher->status( 5 )['layout']['state'] );
	}

	/** A locale cannot be published before any layout is published. */
	public function test_locale_needs_a_published_layout(): void {
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Hallo' ], 0 );
		$result = $this->publish( 0, false, 'nl_NL' );
		$this->assertSame( [ 409, 'blixis_layout_not_published' ], [ $result->status, $result->code ] );
	}

	/** Entries for missing elements block the publish with a list, or are excluded on request. */
	public function test_incompatible_content_is_blocked_or_excluded(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->publish( 0, true, null );
		$this->save_content(
			'nl_NL',
			[
				'hed-1'  => 'Hallo',
				'gone-1' => 'Weg',
			],
			0
		);
		$blocked = $this->publish( 1, false, 'nl_NL' );
		$this->assertSame( [ 409, 'blixis_publish_blocked' ], [ $blocked->status, $blocked->code ] );
		$this->assertSame(
			[
				[
					'id'     => 'gone-1',
					'reason' => 'missing-element',
					'locale' => 'nl_NL',
				],
			],
			$blocked->data['incompatible']
		);
		$this->assertSame( 1, $this->publisher->status( 5 )['pointerRevision'], 'a blocked publish changes nothing' );
		$excluded = $this->publish( 1, false, 'nl_NL', false, true );
		$this->assertNull( $excluded->code );
		$this->assertStringNotContainsString( 'Weg', $this->live( 'nl_NL' ) );
		$this->assertStringContainsString( 'Hallo', $this->live( 'nl_NL' ) );
	}

	/** A layout publish that breaks a published locale reports the impact and pins that locale until confirmed. */
	public function test_layout_publish_impact_and_pinning(): void {
		$this->save_layout( [ 'hed-1', 'hed-2' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->save_content( 'nl_NL', [ 'hed-2' => 'Tweede' ], 0 );
		$this->publish( 0, true, 'en_US' );
		$this->publish( 1, false, 'nl_NL' );
		$this->save_layout( [ 'hed-1' ], 1 );
		$blocked = $this->publish( 2, true, null );
		$this->assertSame( 'blixis_publish_blocked', $blocked->code );
		$this->assertSame(
			[
				[
					'locale' => 'nl_NL',
					'ids'    => [ 'hed-2' ],
				],
			],
			$blocked->data['impacted']
		);
		$this->assertSame( 2, ( $this->publisher->status( 5 )['pointerRevision'] ), 'a blocked publish changes nothing' );
		$nl_before = $this->live( 'nl_NL' );
		$done      = $this->publish( 2, true, null, true );
		$this->assertNull( $done->code );
		$this->assertSame( [ 'nl_NL' ], $done->data['pinnedLocales'] );
		$this->assertSame( $nl_before, $this->live( 'nl_NL' ), 'the broken locale keeps its previous layout' );
		$this->assertStringNotContainsString( 'hed-2', $this->live( 'en_US' ), 'compatible locales move to the new layout' );
	}

	/** A stale pointer revision is a conflict and writes nothing visible. */
	public function test_pointer_conflict(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->publish( 0, true, null );
		$result = $this->publish( 0, true, null );
		$this->assertSame( [ 409, 'blixis_conflict' ], [ $result->status, $result->code ] );
		$this->assertSame( [ 1, 0 ], [ $result->data['currentRevision'], $result->data['expectedRevision'] ] );
		$this->assertSame( 1, $this->publisher->status( 5 )['pointerRevision'] );
	}

	/** Nothing to publish and invalid requests are rejected without touching the pointer. */
	public function test_invalid_requests(): void {
		$this->assertSame( 422, $this->publish( 0, false, null )->status );
		$this->assertSame( 422, $this->publish( 0, true, null )->status, 'no working layout' );
		$this->assertSame( 400, $this->publish( 0, false, 'NL;x' )->status );
		$this->assertSame( 0, $this->publisher->status( 5 )['pointerRevision'] );
	}

	/** Locale rollback restores the (base layout, content) pair exactly; layout rollback republishes an old layout. */
	public function test_rollbacks(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Een' ], 0 );
		$this->publish( 0, true, 'nl_NL' );
		$first = $this->live( 'nl_NL' );
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Twee' ], 1 );
		$this->save_layout( [ 'hed-1', 'hed-2' ], 1 );
		$this->publish( 1, true, 'nl_NL' );
		$this->assertStringContainsString( 'Twee', $this->live( 'nl_NL' ) );
		$back = $this->publisher->publish( 5, new PublishOptions( 2, false, 'nl_NL', false, false, null, 1, 'en_US' ) );
		$this->assertNull( $back->code );
		$this->assertSame( 3, $back->data['contentSnapshot'], 'rollback is append-only: a new snapshot number' );
		$restored = (string) \json_decode( $this->live( 'nl_NL' ), true )[0]['root'][0]['id'];
		$this->assertSame( 'hed-1', $restored );
		$this->assertStringContainsString( 'Een', $this->live( 'nl_NL' ) );
		$this->assertStringNotContainsString( 'hed-2', $this->live( 'nl_NL' ), 'the pair returns to the layout it was published against' );
		$this->assertNotSame( 'none', $first );
		$missing = $this->publisher->publish( 5, new PublishOptions( 3, false, 'nl_NL', false, false, null, 99, 'en_US' ) );
		$this->assertSame( [ 404, 'blixis_snapshot_not_found' ], [ $missing->status, $missing->code ] );
		$layout_back = $this->publisher->publish( 5, new PublishOptions( 3, false, null, true, false, 1, null, 'en_US' ) );
		$this->assertNull( $layout_back->code );
		$this->assertSame( 3, $layout_back->data['layoutSnapshot'] );
	}

	/** Saving working data never moves the pointer (autosave never publishes). */
	public function test_working_writes_do_not_publish(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->publish( 0, true, null );
		$live = $this->live( 'en_US' );
		$this->save_layout( [ 'hed-1', 'hed-9' ], 1 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Draft' ], 0 );
		$this->assertSame( $live, $this->live( 'en_US' ) );
		$this->assertSame( 1, $this->publisher->status( 5 )['pointerRevision'] );
	}

	/** The request policy: capability split, strict bodies and required preconditions. */
	public function test_request_policy(): void {
		$access  = new \Blixis\Builder\Rest\FakePostAccess();
		$site    = new class() implements \Blixis\Builder\Rest\SiteLocale {
			/**
			 * Fixed locale.
			 *
			 * @return string
			 */
			public function default_locale(): string {
				return 'en_US';
			}
		};
		$request = new \Blixis\Builder\Rest\PublicationRequest( $this->publisher, $access, $site );
		$this->assertNull( $request->permission( 5, true ) );
		$access->can_publish = false;
		$this->assertNull( $request->permission( 5, false ), 'editors may read the state' );
		$denied = $request->permission( 6, true );
		$this->assertNotNull( $denied );
		$this->assertSame( 403, $denied->status, 'but not publish' );
		$access->authenticated = false;
		$anonymous             = $request->permission( 7, false );
		$this->assertNotNull( $anonymous );
		$this->assertSame( 401, $anonymous->status );
		$access->authenticated = true;
		$this->assertSame( 428, $request->publish( 5, null, '{}' )->status );
		$this->assertSame( 400, $request->publish( 5, 'x', '{}' )->status );
		foreach ( [ '{"layout":"yes"}', '{"locale":"NL;x"}', '{"evil":1}', '[true]', 'nope', \str_repeat( ' ', 600 ) . '{}', '{"layout":true,"confirmImpact":1}' ] as $bad ) {
			$this->assertSame( 422, $request->publish( 5, '"0"', $bad )->status, $bad );
		}
		foreach ( [ '{}', '{"layoutSnapshot":1,"locale":"nl_NL"}', '{"contentSnapshot":1}', '{"layoutSnapshot":0}', '{"layoutSnapshot":1,"contentSnapshot":1,"locale":"nl_NL"}' ] as $bad ) {
			$this->assertSame( 422, $request->rollback( 5, '"0"', $bad )->status, $bad );
		}
	}
}
