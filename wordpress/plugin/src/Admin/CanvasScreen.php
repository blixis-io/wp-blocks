<?php
/**
 * Isolated same-origin canvas document.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

use Blixis\Builder\Canvas\TokenCss;
use Blixis\Builder\Locale\Direction;
use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Rest\WordPressPostAccess;
use Blixis\Builder\Theme\ThemeCompat;
use Blixis\Builder\Theme\WordPressCompatibilityReader;

\defined( 'ABSPATH' ) || exit;

/** Registers and renders the hidden preview iframe document. */
final class CanvasScreen {
	/** Attach hidden-page hooks. */
	public static function hooks(): void {
		if ( \is_admin() ) {
			\add_action( 'admin_menu', [ self::class, 'menu' ] );
			\add_action( 'admin_init', [ self::class, 'maybe_render' ], 0 );
		}
	}

	/** Register without exposing in a menu. */
	public static function menu(): void {
		\add_submenu_page( '', 'Blixis Canvas', 'Blixis Canvas', 'read', 'blixis-canvas', '__return_empty_string' );
	}

	/** Route only through admin.php and let core redirect unauthenticated users. */
	public static function maybe_render(): void {
		$pagenow = $GLOBALS['pagenow'] ?? null;
		if ( 'admin.php' !== ( \is_string( $pagenow ) ? $pagenow : '' ) || ! isset( $_GET['page'] ) || 'blixis-canvas' !== $_GET['page'] ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only route selector.
			return;
		}
		$config = LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() );
		$query  = [];
		foreach ( [ 'post', 'locale' ] as $key ) {
			if ( isset( $_GET[ $key ] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Parsed below.
				$query[ $key ] = \wp_unslash( $_GET[ $key ] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			}
		}
		$request = EditorRequest::parse( $query, $config );
		$access  = EditorAccess::check( $request->post_id, new WordPressPostAccess(), ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status() );
		if ( EditorAccessResult::UNAUTHENTICATED === $access->state ) {
			return;
		}
		if ( EditorAccessResult::FORBIDDEN === $access->state ) {
			\wp_die( \esc_html__( 'You are not allowed to open this editor.', 'blixis-builder' ), '', [ 'response' => 403 ] );
		}
		$post = \get_post( $request->post_id );
		if ( ! $post instanceof \WP_Post ) {
			\wp_die( \esc_html__( 'You are not allowed to open this editor.', 'blixis-builder' ), '', [ 'response' => 403 ] );
		}
		$assets = EditorAssets::from_manifest( __DIR__ . '/../../assets/editor/manifest.json', \plugins_url( 'assets/editor', \dirname( __DIR__, 2 ) . '/blixis-builder.php' ) );
		if ( null === $assets ) {
			\status_header( 503 );
			exit;
		}
		$assets['canvas_url'] = (string) \add_query_arg( 'ver', $assets['version'], $assets['canvas_url'] );
		$theme                = ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status();
		$tokens               = TokenCss::from_option( \get_option( 'blixis_design_system', false ) );
		$nonce                = EditorHeaders::new_nonce();
		foreach ( EditorHeaders::canvas_list( $nonce ) as $name => $header ) {
			\header( $name . ': ' . $header );
		}
		$stylesheet = \get_stylesheet_directory();
		$theme_css  = '';
		if ( $theme->compatible ) {
			foreach ( [ 'tokens.css', 'theme.css' ] as $file ) {
				if ( \is_file( $stylesheet . '/assets/css/' . $file ) ) {
					$theme_css .= '<link rel="stylesheet" href="' . \esc_url( \get_stylesheet_directory_uri() . '/assets/css/' . $file ) . '">'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- Standalone document intentionally has no wp-admin enqueue lifecycle.
				}
			}
		}
		$lang = \str_replace( '_', '-', $request->content_locale );
		$dir  = Direction::is_rtl( $request->content_locale ) ? 'rtl' : 'ltr';
		echo '<!doctype html><html lang="' . \esc_attr( $lang ) . '" dir="' . \esc_attr( $dir ) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="blixis-canvas" content="' . \esc_attr(
			self::meta_json(
				[
					'version'  => 1,
					'cspNonce' => $nonce,
				]
			)
		) . '">' . $theme_css . '<style nonce="' . \esc_attr( $nonce ) . '">' . $tokens . '</style></head><body class="blx-canvas-body"><div id="blx-canvas-root"></div><script src="' . \esc_url( $assets['canvas_url'] ) . '" nonce="' . \esc_attr( $nonce ) . '" defer></script></body></html>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped, WordPress.WP.EnqueuedResources.NonEnqueuedScript -- Standalone document uses escaped URLs and intentionally avoids wp-admin enqueue lifecycle.
		exit;
	}

	/**
	 * JSON encoded safely for an HTML attribute.
	 *
	 * @param array<string, mixed> $value Meta contract.
	 * @return string
	 */
	public static function meta_json( array $value ): string {
		$json = \json_encode( $value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
		return \is_string( $json ) ? $json : '{}';
	}
}
