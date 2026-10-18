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
use Blixis\Builder\Templates\Importer;
use Blixis\Builder\Publication\WordPressRateLimiter;
use Blixis\Builder\Publication\AuditEvent;
use Blixis\Builder\Publication\WordPressAuditSink;
/** Template REST endpoints. */
final class TemplateController {
	/** Pure policy for the privileged admin-post install adapter.
	 *
	 * @param string $method Request method.
	 * @param bool   $can_edit Whether the user can edit theme options.
	 * @param bool   $can_upload Whether the user can upload files.
	 * @param string $requested_id Submitted template id.
	 * @param string $selected_id Selected template id.
	 * @return bool Whether the request satisfies the adapter policy.
	 */
	public static function admin_install_policy( string $method, bool $can_edit, bool $can_upload, string $requested_id, string $selected_id ): bool {
		return 'POST' === strtoupper( $method ) && $can_edit && $can_upload && '' !== $requested_id && $requested_id === $selected_id && 1 === preg_match( '/^[a-z0-9-]{1,64}$/D', $requested_id );
	}

	/** Admin-post adapter for the existing REST installer policy. */
	public static function admin_install(): void {
		$method = isset( $_SERVER['REQUEST_METHOD'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) : '';
		if ( 'POST' !== strtoupper( $method ) ) {
			wp_die( esc_html__( 'A POST request is required.', 'blixis-builder' ), '', [ 'response' => 405 ] );
		}
		check_admin_referer( 'template_font_install', 'template_font_nonce' );
		$can_edit   = current_user_can( 'edit_theme_options' );
		$can_upload = current_user_can( 'upload_files' );
		if ( ! $can_edit || ! $can_upload ) {
			wp_die( esc_html__( 'You are not allowed to install template fonts.', 'blixis-builder' ), '', [ 'response' => 403 ] );
		}
		$id       = isset( $_POST['template_id'] ) ? sanitize_key( wp_unslash( $_POST['template_id'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
		$selected = isset( $_POST['preset'] ) ? sanitize_key( wp_unslash( $_POST['preset'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
		if ( ! self::admin_install_policy( $method, $can_edit, $can_upload, $id, $selected ) || ! Library::instance()->find( $id ) ) {
			wp_die( esc_html__( 'Template not found.', 'blixis-builder' ), '', [ 'response' => 404 ] );
		}
		$result = self::install_template( $id, '' );
		$ok     = ! is_wp_error( $result );
		$url    = add_query_arg(
			[
				'page'         => 'blixis-setup',
				'step'         => 1,
				'font_install' => $ok ? 'success' : 'error',
				'template'     => $id,
				'scheme'       => isset( $_POST['scheme'] ) ? sanitize_key( wp_unslash( $_POST['scheme'] ) ) : 'template', // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
				'font'         => isset( $_POST['font'] ) ? sanitize_key( wp_unslash( $_POST['font'] ) ) : 'template', // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
			],
			admin_url( 'admin.php' )
		);
		wp_safe_redirect( $url );
		exit;
	}

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
		register_rest_route(
			'blixis/v1',
			'/templates/(?P<id>[a-z0-9-]+)/import',
			[
				'methods'             => 'POST',
				'permission_callback' => [ self::class, 'import_permission' ],
				'callback'            => [ self::class, 'import' ],
			]
		);
	}
	/** Require theme configuration capability.
	 *
	 * @return bool Whether the current user may access template data.
	 */
	public static function permission(): bool {
		return current_user_can( 'edit_theme_options' ); }
	/** Import requires page editing and theme configuration; WordPress REST cookie auth enforces its REST nonce. */
	public static function import_permission(): bool|\WP_Error {
		return current_user_can( 'edit_pages' ) && current_user_can( 'edit_theme_options' ) ? true : new \WP_Error( 'rest_forbidden', 'You are not allowed to import templates.', [ 'status' => 403 ] );
	}
	/** Import a template using a validated request.
	 *
	 * @param \WP_REST_Request $request Request with raw body and route identity.
	 */
	public static function import( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$limit = Importer::record_attempt( get_current_user_id() );
		if ( is_wp_error( $limit ) ) {
			return $limit;
		}
		$data = self::parse_import_body( $request->get_body() );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$id   = (string) RouteParams::get( $request, 'id' );
		$card = Library::instance()->find( $id );
		if ( ! $card ) {
			return new \WP_Error( 'blixis_template_not_found', 'Template not found.', [ 'status' => 404 ] );
		}
		$result = ( new Importer() )->import( $id, $data, true );
		return is_wp_error( $result ) ? $result : self::response( $result );
	}
	/** Strict JSON body policy shared by REST and the setup adapter.
	 *
	 * @param string $raw Raw request body.
	 * @return array<string,bool>|\WP_Error
	 */
	public static function parse_import_body( string $raw ): array|\WP_Error {
		if ( strlen( $raw ) > 4096 ) {
			return new \WP_Error( 'blixis_invalid_template_request', 'Template import request is invalid.', [ 'status' => 400 ] );
		}
		$decoded = '' === $raw ? new \stdClass() : json_decode( $raw );
		if ( ! $decoded instanceof \stdClass ) {
			return new \WP_Error( 'blixis_invalid_template_request', 'Template import request is invalid.', [ 'status' => 400 ] );
		}
		$data = get_object_vars( $decoded );
		if ( array_diff( array_keys( $data ), [ 'createPages', 'setHomePage', 'createNavigation', 'overwriteExisting' ] ) ) {
			return new \WP_Error( 'blixis_invalid_template_request', 'Template import request is invalid.', [ 'status' => 400 ] );
		}
		foreach ( $data as $value ) {
			if ( ! is_bool( $value ) ) {
				return new \WP_Error( 'blixis_invalid_template_request', 'Template import request is invalid.', [ 'status' => 400 ] );
			}
		}
		return $data;
	}
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
		return self::install_template( (string) RouteParams::get( $request, 'id' ), $request->get_body() );
	}
	/** Shared REST/admin-post installation policy.
	 *
	 * @param string $id Validated template id.
	 * @param string $body Raw request body.
	 * @return \WP_REST_Response|\WP_Error Outcome or fixed error.
	 */
	private static function install_template( string $id, string $body ): \WP_REST_Response|\WP_Error {
		if ( ! self::has_empty_body( $body ) ) {
			return new \WP_Error( 'blixis_invalid_template_request', 'Request body must be empty.', [ 'status' => 400 ] );
		}
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
