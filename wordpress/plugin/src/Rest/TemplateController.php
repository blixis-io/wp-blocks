<?php
/**
 * Read-only template catalog and explicit font installation action.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Templates\Library;
use Blixis\Builder\Templates\FontInstaller;
use Blixis\Builder\Publication\WordPressRateLimiter;
use Blixis\Builder\Publication\AuditEvent;
use Blixis\Builder\Publication\WordPressAuditSink;
/** Template REST endpoints. */
final class TemplateController {
	/** Register template endpoints. */
	public static function register(): void {
		register_rest_route(
			'blixis/v1',
			'/templates',
			[
				'methods'             => 'GET',
				'permission_callback' => [ self::class,'permission' ],
				'callback'            => [ self::class,'list' ],
			]
		);
		register_rest_route(
			'blixis/v1',
			'/templates/(?P<id>[a-z0-9-]+)',
			[
				'methods'             => 'GET',
				'permission_callback' => [ self::class,'permission' ],
				'callback'            => [ self::class,'detail' ],
			]
		);
		register_rest_route(
			'blixis/v1',
			'/templates/(?P<id>[a-z0-9-]+)/fonts',
			[
				'methods'             => 'POST',
				'permission_callback' => [ self::class,'permission' ],
				'callback'            => [ self::class,'install' ],
			]
		);
	}
	/** Require theme configuration capability.
	 *
	 * @return bool Whether the current user may access template data.
	 */
	public static function permission(): bool {
		return current_user_can( 'edit_theme_options' ); }
	/** Return validated template cards.
	 *
	 * @return \WP_REST_Response Cards.
	 */
	public static function list(): \WP_REST_Response {
		return self::response( array_map( static fn( $c )=>$c->data, Library::instance()->all() ) ); }
	/** Return one validated card and its design tokens.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error Card or fixed error.
	 */
	public static function detail( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$id   = (string) RouteParams::get( $request, 'id' );
		$card = Library::instance()->find( $id );
		if ( ! $card ) {
			return new \WP_Error( 'blixis_template_not_found', 'Template not found.', [ 'status' => 404 ] );
		}
		return self::response( $card->data + [ 'designTokens' => Library::instance()->tokens( $id ) ] );
	}
	/** Install missing fonts required by one template.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response|\WP_Error Outcome or fixed error.
	 */
	public static function install( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		if ( ! self::has_empty_body( $request->get_body() ) ) {
			return new \WP_Error( 'blixis_invalid_template_request', 'Request body must be empty.', [ 'status' => 400 ] );
		}
		$id   = (string) RouteParams::get( $request, 'id' );
		$card = Library::instance()->find( $id );
		if ( ! $card ) {
			return new \WP_Error( 'blixis_template_not_found', 'Template not found.', [ 'status' => 404 ] );
		}
		$limiter = new WordPressRateLimiter( 'blxtpl_' );
		$actor   = get_current_user_id();
		if ( $limiter->retry_after( $actor, 0 ) > 0 ) {
			return new \WP_Error( 'blixis_rate_limited', 'Template font rate limit reached.', [ 'status' => 429 ] );
		}
		$limiter->record( $actor, 0 );
		$families     = [];
		$family_slugs = [];
		foreach ( $card->data['fonts'] as $font ) {
			$slug = array_search(
				$font['family'],
				[
					'plus-jakarta-sans' => 'Plus Jakarta Sans',
					'inter'             => 'Inter',
					'space-grotesk'     => 'Space Grotesk',
					'dm-sans'           => 'DM Sans',
					'manrope'           => 'Manrope',
					'outfit'            => 'Outfit',
				],
				true
			);
			if ( false === $slug ) {
				continue; }
			$family_slugs[] = $slug;
			if ( $font['installed'] ) {
				continue; }
			$lock = 'blx_font_family_lock_' . $slug;
			if ( ! add_option( $lock, time() + 30, '', false ) ) {
				if ( (int) get_option( $lock, 0 ) > time() ) {
					return new \WP_Error( 'blixis_conflict', 'Template font installation is already in progress.', [ 'status' => 409 ] );
				}
				delete_option( $lock );
				return new \WP_Error( 'blixis_conflict', 'Expired template font lock was cleared; retry the request.', [ 'status' => 409 ] );
			}
			try {
				$result = ( new FontInstaller() )->install( $slug );
			} finally {
				delete_option( $lock );
			}
			if ( ! $result->success ) {
				return new \WP_Error( 'blixis_font_install_failed', 'Template fonts could not be installed.', [ 'status' => 400 ] );
			}
			$families[] = $font['family'];
		}
		( new WordPressAuditSink() )->emit( new AuditEvent( $actor, 0, null, 'template-font-install', null, null, 0, null, $id, $family_slugs ) );
		return self::response( [ 'installed' => $families ] );
	}
	/** Build a private no-store REST response.
	 *
	 * @param array<string,mixed>|list<array<string,mixed>> $data Response data.
	 * @return \WP_REST_Response Response.
	 */
	private static function response( array $data ): \WP_REST_Response {
		$response = new \WP_REST_Response( $data, 200 );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response; }
	/** Accept only an empty raw body for the font action.
	 *
	 * @param string $body Raw request body.
	 * @return bool Whether the body is empty.
	 */
	public static function has_empty_body( string $body ): bool {
		return '' === $body; }
}
