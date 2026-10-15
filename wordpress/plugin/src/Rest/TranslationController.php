<?php
/**
 * Route for the translation status of a locale.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Storage\WpdbDatabase;

\defined( 'ABSPATH' ) || exit;

/** `GET /documents/{id}/content/{locale}/translation-status`. */
final class TranslationController {
	/**
	 * Create the controller.
	 *
	 * @param TranslationRequest $requests Request policy.
	 */
	public function __construct( private readonly TranslationRequest $requests ) {}

	/** Register the route. */
	public static function register(): void {
		global $wpdb;
		$controller = new self( new TranslationRequest( new StreamStore( new WpdbDatabase( $wpdb ) ), new WordPressPostAccess(), new WordPressSiteLocale(), ElementRegistry::from_manifest_file( \Blixis\Builder\DIR . '/data/core-elements.json' ) ) );
		\register_rest_route(
			'blixis/v1',
			'/documents/(?P<post_id>\d+)/content/(?P<locale>[A-Za-z_]+)/translation-status',
			[
				'methods'             => 'GET',
				'callback'            => [ $controller, 'status' ],
				'permission_callback' => [ $controller, 'permission' ],
				'args'                => [
					'post_id' => [
						'type'              => 'integer',
						'required'          => true,
						'validate_callback' => [ DocumentController::class, 'validate_post_id' ],
					],
					'locale'  => [
						'type'              => 'string',
						'required'          => true,
						'validate_callback' => [ DocumentController::class, 'validate_locale' ],
					],
				],
			]
		);
	}

	/**
	 * Authorization callback.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return true|\WP_Error
	 */
	public function permission( \WP_REST_Request $request ): true|\WP_Error {
		$denied = $this->requests->permission( (int) RouteParams::get( $request, 'post_id' ) );
		return null === $denied ? true : new \WP_Error( $denied->error_code ?? 'blixis_forbidden', $denied->message ?? 'Access is forbidden.', [ 'status' => $denied->status ] );
	}

	/**
	 * Translation status.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function status( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$result = $this->requests->status( (int) RouteParams::get( $request, 'post_id' ), (string) RouteParams::get( $request, 'locale' ) );
		if ( null !== $result->error_code ) {
			return new \WP_Error( $result->error_code, $result->message ?? 'Invalid request.', [ 'status' => $result->status ] );
		}
		$response = new \WP_REST_Response( $result->body, 200 );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}
}
