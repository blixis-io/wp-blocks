<?php
/**
 * REST transport for page settings.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Storage\WpdbDatabase;
use Blixis\Builder\Publication\WordPressRateLimiter;
use Blixis\Builder\Publication\AuditEvent;
use Blixis\Builder\Publication\WordPressAuditSink;

\defined( 'ABSPATH' ) || exit;

/** Thin GET/PUT controller. */
final class PageSettingsController {
	/** Create the controller.
	 *
	 * @param PageSettingsRequest $requests Request policy.
	 */
	public function __construct( private readonly PageSettingsRequest $requests ) {}

	/** Register the route. */
	public static function register(): void {
		$controller = new self( new PageSettingsRequest( new WordPressPostAccess(), new WordPressRateLimiter( 'blxpage_' ), new WpdbDatabase( $GLOBALS['wpdb'] ) ) );
		$args       = [
			'post_id' => [
				'type'              => 'integer',
				'required'          => true,
				'validate_callback' => [ DocumentController::class, 'validate_post_id' ],
			],
		];
		\register_rest_route(
			'blixis/v1',
			'/documents/(?P<post_id>\d+)/page',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $controller, 'get' ],
					'permission_callback' => static fn ( \WP_REST_Request $request ) => $controller->permission( $request, false ),
					'args'                => $args,
				],
				[
					'methods'             => 'PUT',
					'callback'            => [ $controller, 'put' ],
					'permission_callback' => static fn ( \WP_REST_Request $request ) => $controller->permission( $request, true ),
					'args'                => $args,
				],
			]
		);
	}

	/** Check the same permission policy as document routes.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @param bool             $write Whether request mutates the post.
	 * @return true|\WP_Error
	 */
	public function permission( \WP_REST_Request $request, bool $write ): true|\WP_Error {
		$denied = $this->requests->permission( (int) RouteParams::get( $request, 'post_id' ), $write );
		return null === $denied ? true : new \WP_Error( $denied->error_code ?? 'blixis_forbidden', $denied->message ?? 'Access is forbidden.', [ 'status' => $denied->status ] );
	}

	/** Return page settings and its version ETag.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$result = $this->requests->get( (int) RouteParams::get( $request, 'post_id' ) );
		if ( $result instanceof DocumentResult ) {
			return self::error( $result );
		}
		$response = new \WP_REST_Response( $result, 200 );
		$response->header( 'ETag', '"' . $result['version'] . '"' );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}

	/** Apply settings and emit a content-free audit event on success.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function put( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$post_id  = (int) RouteParams::get( $request, 'post_id' );
		$if_match = $request->get_header( 'if-match' );
		$result   = $this->requests->put( $post_id, '' === $if_match ? null : $if_match, $request->get_body(), \get_current_user_id() );
		if ( null !== $result->error_code ) {
			return self::error( $result );
		}
		( new WordPressAuditSink() )->emit( new AuditEvent( \get_current_user_id(), $post_id, null, 'page-settings', null, null, 0 ) );
		$response = new \WP_REST_Response( $result->body, 200 );
		$response->header( 'ETag', '"' . $result->body['version'] . '"' );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}

	/** Map a failed result to a REST error.
	 *
	 * @param DocumentResult $result Failed request.
	 */
	private static function error( DocumentResult $result ): \WP_Error {
		if ( 429 === $result->status && isset( $result->body['retryAfter'] ) ) {
			\header( 'Retry-After: ' . (int) $result->body['retryAfter'] );
		}
		return new \WP_Error( $result->error_code ?? 'blixis_storage_error', $result->message ?? 'Request failed.', \array_merge( [ 'status' => $result->status ], $result->body ) );
	}
}
