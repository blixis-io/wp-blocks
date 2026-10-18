<?php
/**
 * Publication abuse and audit regression tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Publication\AuditEvent;
use Blixis\Builder\Publication\AuditSink;
use Blixis\Builder\Publication\PublishOptions;
use Blixis\Builder\Publication\Publisher;
use Blixis\Builder\Publication\RateLimiter;
use Blixis\Builder\Publication\RateStore;
use Blixis\Builder\Publication\SlidingRateLimiter;
use Blixis\Builder\Publication\WordPressAuditSink;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Rest\FakePostAccess;
use Blixis\Builder\Rest\FakeSiteLocale;
use Blixis\Builder\Rest\PublicationRequest;
use Blixis\Builder\Rest\PublicationController;
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
require_once __DIR__ . '/FakeDatabase.php';
require_once __DIR__ . '/FakePostAccess.php';
require_once __DIR__ . '/FakeSiteLocale.php';
require_once __DIR__ . '/RestWordPressStubs.php';
require_once __DIR__ . '/RestResponseStub.php';
require_once __DIR__ . '/PublicationWordPressStubs.php';

/** Successful actions are audited and repeated publishing is bounded. */
final class PublicationSecurityTest extends TestCase {
	/** A fake clock proves the 30th write closes the hour and one slot reopens at 3600 seconds. */
	public function test_rolling_window_with_fake_clock_and_store(): void {
		$now     = 10000;
		$store   = new class() implements RateStore {
			/** Stored timestamps.
			 *
			 * @var array<string,list<int>>
			 */
			public array $data = [];
			/** Read recorded timestamps.
			 *
			 * @param int $actor User ID.
			 * @param int $post_id Post ID.
			 * @return list<int>
			 */
			public function read( int $actor, int $post_id ): array {
				return $this->data[ $actor . ':' . $post_id ] ?? [];
			}
			/** Store recorded timestamps.
			 *
			 * @param int   $actor User ID.
			 * @param int   $post_id Post ID.
			 * @param array $times Timestamps.
			 * @phpstan-param list<int> $times
			 */
			public function write( int $actor, int $post_id, array $times ): void {
				$this->data[ $actor . ':' . $post_id ] = $times;
			}
		};
		$limiter = new SlidingRateLimiter(
			$store,
			static function () use ( &$now ): int {
				return $now;
			}
		);
		for ( $i = 0; $i < 30; ++$i ) {
			$this->assertSame( 0, $limiter->retry_after( 7, 5 ) );
			$limiter->record( 7, 5 );
		}
		$this->assertSame( 3600, $limiter->retry_after( 7, 5 ) );
		$this->assertSame( 0, $limiter->retry_after( 8, 5 ) );
		$now += 3599;
		$this->assertSame( 1, $limiter->retry_after( 7, 5 ) );
		++$now;
		$this->assertSame( 0, $limiter->retry_after( 7, 5 ) );
	}
	/** Audit data has no content, and the injected sink records the exact event. */
	public function test_audit_event_contract(): void {
		$sink = new class() implements AuditSink {
			/** Recorded events.
			 *
			 * @var list<array<string,mixed>>
			 */
			public array $events = [];
			/** Capture one event.
			 *
			 * @param AuditEvent $event Event.
			 */
			public function emit( AuditEvent $event ): void {
				$this->events[] = $event->data();
			}
		};
		$sink->emit( new AuditEvent( 7, 5, 'nl_NL', 'rollback', null, 12, 33, 0 ) );
		$this->assertSame( [ 'actor', 'post', 'locale', 'kind', 'layoutSnapshot', 'contentSnapshot', 'pointerRevision', 'time' ], \array_keys( $sink->events[0] ) );
		$this->assertSame( '1970-01-01T00:00:00Z', $sink->events[0]['time'] );
		$this->assertSame( 'rollback', $sink->events[0]['kind'] );
		$template_event = ( new AuditEvent( 7, 0, null, 'template-font-install', null, null, 0, 0, 'business', [ 'inter', '../bad' ] ) )->data();
		$this->assertSame( 'business', $template_event['templateId'] ?? null );
		$this->assertSame( [ 'inter' ], $template_event['familySlugs'] ?? null );
		$import_event = ( new AuditEvent( 7, 0, null, 'template-import', null, null, 0, 0, 'business', [ 'business_logo' ] ) )->data();
		$this->assertSame( 'template-import', $import_event['kind'] );
		$this->assertSame( 'business', $import_event['templateId'] ?? null );
		$this->assertSame( [ 'business_logo' ], $import_event['assetReferences'] ?? null );
		$this->assertArrayNotHasKey( 'content', $import_event );
	}

	/** The production sink invokes the documented WordPress action with the safe payload. */
	public function test_wordpress_audit_hook(): void {
		\BlixisAuditHookState::$events = [];
		( new WordPressAuditSink() )->emit( new AuditEvent( 7, 5, null, 'publish', 2, null, 3, 0 ) );
		$events = \BlixisAuditHookState::all();
		$this->assertCount( 1, $events );
		$this->assertSame( 'blixis_builder_publication_event', $events[0][0] );
		$this->assertSame( 'publish', $events[0][1]['kind'] );
	}

	/** The controller emits publish and rollback events only after successful pointer moves. */
	public function test_controller_emits_only_successful_events(): void {
		$db      = new FakeDatabase();
		$streams = new StreamStore( $db );
		$this->assertTrue( $streams->write( 5, MetaKeys::LAYOUT, '{"schemaVersion":1,"layoutRevision":1,"root":[]}', 0 )->success );
		$publisher  = new Publisher( $db, $streams, new SnapshotStore( $db, $streams ), ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ) );
		$sink       = new class() implements AuditSink {
			/** Recorded events.
			 *
			 * @var list<array<string,mixed>>
			 */
			public array $events = [];
			/** Capture an event.
			 *
			 * @param AuditEvent $event Safe event.
			 */
			public function emit( AuditEvent $event ): void {
				$this->events[] = $event->data();
			}
		};
		$controller = new PublicationController( new PublicationRequest( $publisher, new FakePostAccess(), new FakeSiteLocale() ), $sink );
		$publish    = new class() extends \WP_REST_Request {
			/** Publish fixture request. */
			public function __construct() {
				parent::__construct( 'POST', 5, '{"layout":true}' );
			}
			/** Return the precondition header.
			 *
			 * @param string $key Header name.
			 */
			public function get_header( string $key ): string {
				return 'if-match' === $key ? '"0"' : '';
			}
		};
		$this->assertInstanceOf( \WP_REST_Response::class, $controller->publish( $publish ) );
		$this->assertSame( 'publish', $sink->events[0]['kind'] );
		$this->assertSame( 7, $sink->events[0]['actor'] );
		$this->assertSame( 1, $sink->events[0]['pointerRevision'] );
		$this->assertInstanceOf( \WP_Error::class, $controller->publish( $publish ) );
		$this->assertCount( 1, $sink->events );
		$rollback = new class() extends \WP_REST_Request {
			/** Rollback fixture request. */
			public function __construct() {
				parent::__construct( 'POST', 5, '{"layoutSnapshot":1}' );
			}
			/** Return the precondition header.
			 *
			 * @param string $key Header name.
			 */
			public function get_header( string $key ): string {
				return 'if-match' === $key ? '"1"' : '';
			}
		};
		$this->assertInstanceOf( \WP_REST_Response::class, $controller->rollback( $rollback ) );
		$this->assertSame( 'rollback', $sink->events[1]['kind'] );
		$unpublish                         = new class() extends \WP_REST_Request {
			/** Unpublish fixture request. */
			public function __construct() {
				parent::__construct( 'POST', 5, '{}' );
			}
			/** Return the pointer precondition.
			 *
			 * @param string $key Header name.
			 */
			public function get_header( string $key ): string {
				return 'if-match' === $key ? '"2"' : '';
			}
		};
		\BlixisInvalidationState::$updates = 0;
		$this->assertInstanceOf( \WP_REST_Response::class, $controller->unpublish( $unpublish ) );
		$this->assertSame( 0, \BlixisInvalidationState::$updates, 'unpublish does not bump the site-wide render-cache epoch' );
		$this->assertSame( 'unpublish', $sink->events[2]['kind'] );
		$this->assertNull( $sink->events[2]['locale'], 'unpublish audit locale is always null' );
		$this->assertSame( [ 'actor', 'post', 'locale', 'kind', 'layoutSnapshot', 'contentSnapshot', 'pointerRevision', 'time' ], \array_keys( $sink->events[2] ) );
	}

	/** Unpublish requires If-Match, rejects stale revisions and returns a safe storage error if its lock fails. */
	public function test_unpublish_preconditions_and_lock_failure(): void {
		$db        = new FakeDatabase();
		$streams   = new StreamStore( $db );
		$publisher = new Publisher( $db, $streams, new SnapshotStore( $db, $streams ), ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ) );
		$request   = new PublicationRequest( $publisher, new FakePostAccess(), new FakeSiteLocale() );
		$this->assertSame( [ 428, 'blixis_precondition_required' ], [ $request->unpublish( 5, null )->status, $request->unpublish( 5, null )->code ] );
		$this->assertSame( [ 409, 'blixis_conflict' ], [ $request->unpublish( 5, '"4"' )->status, $request->unpublish( 5, '"4"' )->code ] );
		$db->fail_lock = true;
		$this->assertSame( [ 500, 'blixis_storage_error' ], [ $request->unpublish( 5, '"0"' )->status, $request->unpublish( 5, '"0"' )->code ] );
	}

	/** A full post cannot gain another snapshot or move its pointer. */
	public function test_snapshot_limit_precedes_writes(): void {
		$db      = new FakeDatabase();
		$streams = new StreamStore( $db );
		$layout  = '{"schemaVersion":1,"layoutRevision":1,"root":[]}';
		$this->assertTrue( $streams->write( 5, MetaKeys::LAYOUT, $layout, 0 )->success );
		for ( $i = 1; $i <= 200; ++$i ) {
			$db->data[5][ MetaKeys::snap_layout( $i ) ] = [
				[
					'id'    => $i + 10,
					'value' => $layout,
				],
			];
		}
		$before    = $db->data;
		$publisher = new Publisher( $db, $streams, new SnapshotStore( $db, $streams ), ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ) );
		$result    = $publisher->publish( 5, new PublishOptions( 0, true ) );
		$this->assertSame( [ 409, 'blixis_snapshot_limit' ], [ $result->status, $result->code ] );
		$this->assertSame( $before, $db->data );
	}

	/** Rollback through the request policy stays available from 200 to 239 snapshots, then stops at 240. */
	public function test_rollback_snapshot_recovery_ceiling(): void {
		foreach ( [ 200, 239, 240 ] as $count ) {
			$db      = new FakeDatabase();
			$streams = new StreamStore( $db );
			$layout  = '{"schemaVersion":1,"layoutRevision":1,"root":[]}';
			$this->assertTrue( $streams->write( 5, MetaKeys::LAYOUT, $layout, 0 )->success );
			$publisher = new Publisher( $db, $streams, new SnapshotStore( $db, $streams ), ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ) );
			$this->assertNull( $publisher->publish( 5, new PublishOptions( 0, true ) )->code );
			for ( $i = 2; $i <= $count; ++$i ) {
				$db->data[5][ MetaKeys::snap_layout( $i ) ] = [
					[
						'id'    => $i + 10,
						'value' => $layout,
					],
				];
			}
			$before  = $db->data;
			$request = new PublicationRequest( $publisher, new FakePostAccess(), new FakeSiteLocale() );
			$result  = $request->rollback( 5, '"1"', '{"layoutSnapshot":1}' );
			if ( 240 === $count ) {
				$this->assertSame( [ 409, 'blixis_snapshot_limit' ], [ $result->status, $result->code ] );
				$this->assertSame( $before, $db->data );
			} else {
				$this->assertNull( $result->code );
				$this->assertCount( $count + 1, $db->snapshot_keys( 5 ) );
				$this->assertSame( 2, $result->data['pointerRevision'] );
			}
		}
	}

	/** The request gate does not read storage when the rolling limiter refuses a write. */
	public function test_rate_limit_precedes_storage(): void {
		$db        = new FakeDatabase();
		$streams   = new StreamStore( $db );
		$publisher = new Publisher( $db, $streams, new SnapshotStore( $db, $streams ), ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ) );
		$limiter   = new class() implements RateLimiter {
			/** Number of successful writes recorded.
			 *
			 * @var int
			 */
			public int $recorded = 0;
			/** Return a fixed retry delay.
			 *
			 * @param int $actor User ID.
			 * @param int $post_id Post ID.
			 */
			public function retry_after( int $actor, int $post_id ): int {
				return 31;
			}
			/** Count a successful publication.
			 *
			 * @param int $actor User ID.
			 * @param int $post_id Post ID.
			 */
			public function record( int $actor, int $post_id ): void {
				++$this->recorded;
			}
		};
		$request   = new PublicationRequest( $publisher, new FakePostAccess(), new FakeSiteLocale(), null, $limiter );
		$result    = $request->publish( 5, '"0"', '{"layout":true}', 7 );
		$this->assertSame( [ 429, 'blixis_rate_limited', 31 ], [ $result->status, $result->code, $result->data['retryAfter'] ] );
		$this->assertSame( [], $db->read_keys );
		$this->assertSame( 0, $limiter->recorded );
		$unpublish = $request->unpublish( 5, '"0"', 7, '{}' );
		$this->assertSame( [ 429, 'blixis_rate_limited', 31 ], [ $unpublish->status, $unpublish->code, $unpublish->data['retryAfter'] ] );
		$this->assertSame( 0, $limiter->recorded );
	}
}
