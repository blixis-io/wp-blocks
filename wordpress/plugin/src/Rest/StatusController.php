<?php
/**
 * Theme status REST transport.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Theme\ThemeCompat;
use Blixis\Builder\Theme\WordPressCompatibilityReader;
\defined( 'ABSPATH' ) || exit;
/** Registers the current editor eligibility status. */
final class StatusController {
	/** Register the read-only route. */
	public static function register(): void {
		\register_rest_route(
			'blixis/v1',
			'/status',
			[
				'methods'             => 'GET',
				'callback'            => [ self::class, 'get' ],
				'permission_callback' => [ self::class, 'permission' ],
			]
		);
		\add_filter( 'rest_post_dispatch', [ self::class, 'no_store' ], 10, 3 );
	}
	/** Keep success and permission-error responses private.
	 *
	 * @param mixed            $response REST response.
	 * @param mixed            $server REST server.
	 * @param \WP_REST_Request $request REST request.
	 * @return mixed
	 */
	public static function no_store( mixed $response, mixed $server, \WP_REST_Request $request ): mixed {
		if ( $response instanceof \WP_REST_Response && '/blixis/v1/status' === $request->get_route() ) {
			$response->header( 'Cache-Control', 'private, no-store' );
		}
		return $response;
	}
	/** Apply authentication before the capability check. @return true|\WP_Error */
	public static function permission(): true|\WP_Error {
		$denied = self::request()->permission( \is_user_logged_in(), \current_user_can( 'edit_posts' ) );
		return null === $denied ? true : new \WP_Error( $denied->error_code ?? 'blixis_forbidden', $denied->message ?? '', [ 'status' => $denied->status ] );
	}
	/** Respond without caching. @return \WP_REST_Response */
	public static function get(): \WP_REST_Response {
		$response = new \WP_REST_Response( self::request()->status(), 200 );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}
	/** Construct a request policy. */
	private static function request(): StatusRequest {
		return new StatusRequest( new ThemeCompat( new WordPressCompatibilityReader() ) );
	}
}
