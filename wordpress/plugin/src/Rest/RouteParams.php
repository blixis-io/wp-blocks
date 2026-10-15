<?php
/**
 * Route parameters that a request body cannot override.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

\defined( 'ABSPATH' ) || exit;

/**
 * `WP_REST_Request::get_param()` merges JSON body, form and query values with the URL parameters, and the body wins. A JSON
 * body with a `locale` or `post_id` field (the content envelope has a `locale` field) would therefore silently replace the
 * identity in the URL. Identity always comes from the URL parameters only.
 */
final class RouteParams {
	/**
	 * A URL parameter of the matched route.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @param string           $name Parameter name from the route pattern.
	 * @return mixed
	 */
	public static function get( \WP_REST_Request $request, string $name ): mixed {
		$params = $request->get_url_params();
		return $params[ $name ] ?? null;
	}
}
