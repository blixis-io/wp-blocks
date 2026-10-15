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
	 */
	public function __construct( private readonly PublicationRequest $requests ) {}

	/** Register the routes. */
	public static function register(): void {
		global $wpdb;
		$database   = new WpdbDatabase( $wpdb );
		$streams    = new StreamStore( $database, null, new RevisionRing( $database, new WordPressRevisionContext() ) );
		$publisher  = new Publisher( $database, $streams, new SnapshotStore( $database, $streams ), ElementRegistry::from_manifest_file( \Blixis\Builder\DIR . '/data/core-elements.json' ) );
		$controller = new self( new PublicationRequest( $publisher, new WordPressPostAccess(), new WordPressSiteLocale() ) );
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
			'publish'  => 'publish',
			'rollback' => 'rollback',
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
		$denied = $this->requests->permission( (int) $request->get_param( 'post_id' ), $changes_state );
		return null === $denied ? true : self::error( $denied );
	}

	/**
	 * Publication state.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function status( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		return self::response( $this->requests->status( (int) $request->get_param( 'post_id' ) ) );
	}

	/**
	 * Publish.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function publish( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$if_match = $request->get_header( 'if-match' );
		return self::response( $this->requests->publish( (int) $request->get_param( 'post_id' ), '' === $if_match ? null : $if_match, $request->get_body() ) );
	}

	/**
	 * Roll back.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rollback( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$if_match = $request->get_header( 'if-match' );
		return self::response( $this->requests->rollback( (int) $request->get_param( 'post_id' ), '' === $if_match ? null : $if_match, $request->get_body() ) );
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
		$messages = [
			401 => 'Authentication is required.',
			403 => 'Publishing is forbidden.',
			423 => 'The active theme does not support Blixis editing.',
			404 => 'Snapshot not found.',
			409 => 'The publication could not be applied.',
			422 => 'The request cannot be applied.',
			428 => 'If-Match is required.',
			500 => 'Publication storage failed.',
		];
		return new \WP_Error( $result->code ?? 'blixis_storage_error', $messages[ $result->status ] ?? 'Invalid request.', \array_merge( [ 'status' => $result->status ], $result->data ) );
	}
}
