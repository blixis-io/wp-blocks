<?php
/**
 * Publication routes: state, publish and rollback.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Publication\PublishResult;
use Blixis\Builder\Publication\Publisher;
use Blixis\Builder\Publication\AuditEvent;
use Blixis\Builder\Publication\AuditSink;
use Blixis\Builder\Publication\WordPressAuditSink;
use Blixis\Builder\Publication\WordPressRateLimiter;
use Blixis\Builder\Frontend\Invalidation;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Storage\RevisionRing;
use Blixis\Builder\Storage\SnapshotStore;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Storage\WordPressRevisionContext;
use Blixis\Builder\Storage\WpdbDatabase;

\defined( 'ABSPATH' ) || exit;

/**
 * `GET /documents/{id}/published`, `POST /documents/{id}/publish`, `POST /documents/{id}/rollback`.
 * Reading the state needs edit rights; publishing and rollback need the publish capability for the post. Writes carry the
 * pointer revision in `If-Match` (409 with both revisions on mismatch).
 */
final class PublicationController {
	/**
	 * Create the controller.
	 *
	 * @param PublicationRequest $requests Request policy.
	 * @param ?AuditSink         $audit Audit event sink.
	 */
	public function __construct( private readonly PublicationRequest $requests, private ?AuditSink $audit = null ) {}

	/** Register the routes. */
	public static function register(): void {
		global $wpdb;
		$database   = new WpdbDatabase( $wpdb );
		$streams    = new StreamStore( $database, null, new RevisionRing( $database, new WordPressRevisionContext() ) );
		$publisher  = new Publisher( $database, $streams, new SnapshotStore( $database, $streams ), ElementRegistry::from_manifest_file( \Blixis\Builder\DIR . '/data/core-elements.json' ) );
		$controller = new self( new PublicationRequest( $publisher, new WordPressPostAccess(), new WordPressSiteLocale(), null, new WordPressRateLimiter() ), new WordPressAuditSink() );
		$args       = [
			'post_id' => [
				'type'              => 'integer',
				'required'          => true,
				'validate_callback' => [ DocumentController::class, 'validate_post_id' ],
			],
		];
		\register_rest_route(
			'blixis/v1',
			'/documents/(?P<post_id>\d+)/published',
			[
				'methods'             => 'GET',
				'callback'            => [ $controller, 'status' ],
				'permission_callback' => static fn ( \WP_REST_Request $request ) => $controller->permission( $request, false ),
				'args'                => $args,
			]
		);
		foreach ( [
			'publish'   => 'publish',
			'rollback'  => 'rollback',
			'unpublish' => 'unpublish',
		] as $path => $method ) {
			\register_rest_route(
				'blixis/v1',
				'/documents/(?P<post_id>\d+)/' . $path,
				[
					'methods'             => 'POST',
					'callback'            => [ $controller, $method ],
					'permission_callback' => static fn ( \WP_REST_Request $request ) => $controller->permission( $request, true ),
					'args'                => $args,
				]
			);
		}
	}

	/**
	 * Authorization callback.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @param bool             $changes_state Whether the route changes publication.
	 * @return true|\WP_Error
	 */
	public function permission( \WP_REST_Request $request, bool $changes_state ): true|\WP_Error {
		$denied = $this->requests->permission( (int) RouteParams::get( $request, 'post_id' ), $changes_state );
		return null === $denied ? true : self::error( $denied );
	}

	/**
	 * Publication state.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function status( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		return self::response( $this->requests->status( (int) RouteParams::get( $request, 'post_id' ) ) );
	}

	/**
	 * Publish.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function publish( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$if_match = $request->get_header( 'if-match' );
		return $this->change( $request, 'publish', $this->requests->publish( (int) RouteParams::get( $request, 'post_id' ), '' === $if_match ? null : $if_match, $request->get_body(), \get_current_user_id() ) );
	}

	/**
	 * Roll back.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rollback( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$if_match = $request->get_header( 'if-match' );
		return $this->change( $request, 'rollback', $this->requests->rollback( (int) RouteParams::get( $request, 'post_id' ), '' === $if_match ? null : $if_match, $request->get_body(), \get_current_user_id() ) );
	}

	/**
	 * Unpublish every layout and locale while retaining snapshots and working streams.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function unpublish( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$if_match = $request->get_header( 'if-match' );
		return $this->change( $request, 'unpublish', $this->requests->unpublish( (int) RouteParams::get( $request, 'post_id' ), '' === $if_match ? null : $if_match, \get_current_user_id(), $request->get_body() ) );
	}

	/**
	 * Emit only after a successful pointer move.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @param string           $kind Publish or rollback.
	 * @param PublishResult    $result Result.
	 * @return \WP_REST_Response|\WP_Error
	 */
	private function change( \WP_REST_Request $request, string $kind, PublishResult $result ): \WP_REST_Response|\WP_Error {
		if ( null === $result->code ) {
			if ( 'publish' === $kind || 'rollback' === $kind ) {
				Invalidation::bump();
			}
			$body   = \json_decode( $request->get_body(), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_decode_json_decode -- Already validated by request policy.
			$locale = 'unpublish' === $kind ? null : ( \is_array( $body ) && \is_string( $body['locale'] ?? null ) ? $body['locale'] : null );
			( $this->audit ?? new WordPressAuditSink() )->emit( new AuditEvent( \get_current_user_id(), (int) RouteParams::get( $request, 'post_id' ), $locale, $kind, $result->data['layoutSnapshot'] ?? null, $result->data['contentSnapshot'] ?? null, $result->data['pointerRevision'] ) );
		}
		return self::response( $result );
	}

	/**
	 * Map a result to a response.
	 *
	 * @param PublishResult $result Result.
	 * @return \WP_REST_Response|\WP_Error
	 */
	private static function response( PublishResult $result ): \WP_REST_Response|\WP_Error {
		if ( null !== $result->code ) {
			return self::error( $result );
		}
		$response = new \WP_REST_Response( $result->data, 200 );
		if ( \is_int( $result->data['pointerRevision'] ?? null ) ) {
			$response->header( 'ETag', '"' . $result->data['pointerRevision'] . '"' );
		}
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}

	/**
	 * Map a failure to a REST error with a stable code and no internals.
	 *
	 * @param PublishResult $result Failure.
	 * @return \WP_Error
	 */
	private static function error( PublishResult $result ): \WP_Error {
		if ( 429 === $result->status ) {
			\header( 'Retry-After: ' . (int) ( $result->data['retryAfter'] ?? 1 ) );
		}
		$code = $result->code ?? 'blixis_storage_error';
		return new \WP_Error( $code, ErrorCatalog::message( $code ), \array_merge( [ 'status' => $result->status ], $result->data ) );
	}
}
