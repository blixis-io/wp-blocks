<?php
/**
 * Authenticated front-end draft preview gate and response headers.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

use Blixis\Builder\Storage\MetaRegistration;

\defined( 'ABSPATH' ) || exit;

/** Enables working-stream rendering only for a valid per-post editor nonce and capability. */
final class DraftPreview {
	/** Whether this request passed the preview authorization gate.
	 *
	 * @var bool
	 */
	private static bool $active = false;

	/** Register before frontend output. */
	public static function hooks(): void {
		\add_action( 'template_redirect', [ self::class, 'authorize' ], 0 );
		\add_filter( 'redirect_canonical', [ self::class, 'canonical_redirect' ], 1, 2 );
		\add_action( 'wp_footer', [ self::class, 'badge' ] );
	}

	/**
	 * Keep WordPress canonicalization from dropping the authorized preview query nonce.
	 *
	 * @param string|false $redirect Canonical redirect URL.
	 * @param string       $requested Requested URL.
	 * @return string|false
	 */
	public static function canonical_redirect( string|false $redirect, string $requested ): string|false {
		unset( $requested );
		return self::$active ? false : $redirect;
	}

	/** Validate the complete request, and apply private no-store headers only after authorization. */
	public static function authorize(): void {
		if ( ! \is_singular() || ! isset( $_GET['blixis_preview'] ) || ! \is_string( $_GET['blixis_preview'] ) || ! \is_user_logged_in() ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- This query nonce is verified immediately below.
			return;
		}
		$post_id = (int) \get_queried_object_id();
		if ( ! \in_array( \get_post_type( $post_id ), MetaRegistration::post_types(), true ) ) {
			return;
		}
		$nonce_valid = (bool) \wp_verify_nonce( \sanitize_text_field( \wp_unslash( $_GET['blixis_preview'] ) ), 'blixis_preview_' . $post_id ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Per-post preview nonce is the authorization token.
		if ( ! self::request_is_authorized( true, true, true, \current_user_can( 'edit_post', $post_id ), $post_id, $nonce_valid ) ) {
			return;
		}
		self::$active = true;
		if ( ! \defined( 'DONOTCACHEPAGE' ) ) { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Common cache-plugin bypass constant required by the preview response contract.
			\define( 'DONOTCACHEPAGE', true ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Common cache-plugin bypass constant required by the preview response contract.
		}
		\nocache_headers();
		\header( 'Cache-Control: no-store, private, max-age=0', true );
		\header( 'X-Robots-Tag: noindex, nofollow', true );
		\header( 'Referrer-Policy: same-origin', true );
	}

	/**
	 * Pure request-gate contract used to cover each independent authorization condition.
	 *
	 * @param bool $singular Singular builder post request.
	 * @param bool $has_query Preview query argument exists.
	 * @param bool $logged_in Viewer is authenticated.
	 * @param bool $capable Viewer can edit the post.
	 * @param int  $post_id Queried post ID.
	 * @param bool $nonce_valid Per-post nonce is valid.
	 */
	public static function request_is_authorized( bool $singular, bool $has_query, bool $logged_in, bool $capable, int $post_id, bool $nonce_valid ): bool {
		return $singular && $has_query && $logged_in && $capable && $post_id > 0 && $nonce_valid;
	}

	/** Whether this request passed all authorization checks. */
	public static function active(): bool {
		return self::$active;
	}

	/** Add a small, escaped label outside the saved document. */
	public static function badge(): void {
		if ( self::$active ) {
			echo '<div class="blx-draft-preview-badge" role="status">' . \esc_html__( 'Draft preview', 'blixis-builder' ) . '</div>';
		}
	}
}
