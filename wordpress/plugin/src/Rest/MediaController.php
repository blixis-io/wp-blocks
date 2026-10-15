<?php
/**
 * Read-only media route for the editor's picker and canvas.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Media\MediaPolicy;
use Blixis\Builder\Render\WordPressMediaResolver;

\defined( 'ABSPATH' ) || exit;

/**
 * `GET /blixis/v1/media/{id}`: what the editor needs to show one library image. Unknown, non-image and SVG attachments are
 * the same 404, so the route does not reveal what else the library holds. The picker itself is the WordPress media modal
 * (BWB-054); this route only describes a chosen attachment.
 */
final class MediaController {
	/** Register the route. */
	public static function register(): void {
		\register_rest_route(
			'blixis/v1',
			'/media/(?P<id>\d+)',
			[
				'methods'             => 'GET',
				'callback'            => [ self::class, 'get' ],
				'permission_callback' => [ self::class, 'permission' ],
				'args'                => [
					'id' => [
						'type'              => 'integer',
						'required'          => true,
						'validate_callback' => [ DocumentController::class, 'validate_post_id' ],
					],
				],
			]
		);
	}

	/**
	 * Only people who can edit posts may read media descriptions.
	 *
	 * @return true|\WP_Error
	 */
	public static function permission(): true|\WP_Error {
		if ( ! \is_user_logged_in() ) {
			return new \WP_Error( 'blixis_unauthenticated', ErrorCatalog::message( 'blixis_unauthenticated' ), [ 'status' => 401 ] );
		}
		return \current_user_can( 'edit_posts' ) ? true : new \WP_Error( 'blixis_forbidden', ErrorCatalog::message( 'blixis_forbidden' ), [ 'status' => 403 ] );
	}

	/**
	 * Describe one attachment.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$id    = (int) $request->get_param( 'id' );
		$media = ( new WordPressMediaResolver() )->resolve( $id );
		if ( null === $media ) {
			return new \WP_Error( 'blixis_media_not_found', ErrorCatalog::message( 'blixis_media_not_found' ), [ 'status' => 404 ] );
		}
		$response = new \WP_REST_Response( MediaPolicy::describe( $id, $media ), 200 );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}
}
