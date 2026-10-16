<?php
/**
 * Isolated same-origin canvas document.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

use Blixis\Builder\Canvas\TokenCss;
use Blixis\Builder\Canvas\PageShell;
use Blixis\Builder\Canvas\FontFaceCss;
use Blixis\Builder\Locale\Direction;
use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Rest\WordPressPostAccess;
use Blixis\Builder\Theme\ThemeCompat;
use Blixis\Builder\Theme\WordPressCompatibilityReader;
use Blixis\Theme\Setup as ThemeSetup;

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
		$theme_css  = '';
		$font_faces = '';
		if ( $theme->compatible && \class_exists( ThemeSetup::class ) ) {
			// Register only Blixis theme styles. Running the global enqueue action here would admit plugin/admin styles.
			ThemeSetup::enqueue();
			$theme_css  = self::theme_stylesheet_links( \wp_styles() );
			$font_faces = FontFaceCss::from_wordpress();
		}
		$lang = \str_replace( '_', '-', $request->content_locale );
		$dir  = Direction::is_rtl( $request->content_locale ) ? 'rtl' : 'ltr';
		echo self::document_markup( $theme_css, $tokens, $nonce, $assets['canvas_url'], $lang, $dir, $post, $font_faces ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- All dynamic document values are escaped in document_markup().
		exit;
	}

	/**
	 * Render only registered styles from the active Blixis theme build and its child stylesheet.
	 *
	 * @param \WP_Styles $styles Registered WordPress styles.
	 * @return string Escaped stylesheet link elements.
	 */
	public static function theme_stylesheet_links( \WP_Styles $styles ): string {
		$version = \wp_get_theme()->get( 'Version' );
		if ( ! \is_string( $version ) || '' === $version ) {
			return '';
		}
		$expected = ThemeSetup::styles( \get_stylesheet_uri(), \get_template_directory_uri(), $version );
		$allowed  = [ 'blixis-style', 'blixis-parent-style', 'blixis-tokens', 'blixis-theme' ];
		$urls     = [];
		foreach ( $allowed as $handle ) {
			if ( ! isset( $expected[ $handle ], $styles->registered[ $handle ] ) ) {
				continue;
			}
			$source = $styles->registered[ $handle ]->src;
			if ( ! \is_string( $source ) || '' === $source || ! self::is_theme_stylesheet( $source ) ) {
				continue;
			}
			$expected_url = $expected[ $handle ]['url'];
			$registered   = \strtok( $source, '?' );
			if ( $registered !== $expected_url ) {
				continue;
			}
			$urls[] = $source;
		}
		$output = '';
		foreach ( $urls as $url ) {
			$output .= '<link rel="stylesheet" href="' . \esc_url( $url ) . '">'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- Standalone document intentionally loads only registered theme styles.
		}
		return $output;
	}

	/**
	 * Require a same-origin URL under the active theme or child theme directory.
	 *
	 * @param string $url Candidate registered stylesheet URL.
	 * @return bool
	 */
	private static function is_theme_stylesheet( string $url ): bool {
		$parts  = \wp_parse_url( $url );
		$origin = \wp_parse_url( \home_url( '/' ) );
		$dirs   = [ \wp_parse_url( \get_stylesheet_directory_uri() ), \wp_parse_url( \get_template_directory_uri() ) ];
		if ( ! \is_array( $parts ) || ! \is_array( $origin ) || ! isset( $parts['scheme'], $parts['host'], $parts['path'], $origin['scheme'], $origin['host'] ) ) {
			return false;
		}
		if ( \strtolower( $parts['scheme'] ) !== \strtolower( $origin['scheme'] ) || \strtolower( $parts['host'] ) !== \strtolower( $origin['host'] ) || ( $parts['port'] ?? null ) !== ( $origin['port'] ?? null ) || ! \in_array( $parts['scheme'], [ 'https', 'http' ], true ) ) {
			return false;
		}
		foreach ( $dirs as $dir ) {
			if ( \is_array( $dir ) && isset( $dir['path'] ) && ( $parts['path'] === $dir['path'] || \str_starts_with( $parts['path'], \rtrim( $dir['path'], '/' ) . '/' ) ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Build the standalone canvas document markup.
	 *
	 * @param string        $theme_styles Escaped registered theme stylesheet links.
	 * @param string        $tokens       Validated token stylesheet.
	 * @param string        $nonce        Per-response CSP nonce.
	 * @param string        $canvas_url   Same-origin runtime URL.
	 * @param string        $lang         Content locale language tag.
	 * @param string        $dir  Content locale direction.
	 * @param \WP_Post|null $post Current document post.
	 * @param string        $font_faces WordPress font-face CSS, filtered again for same-origin safety.
	 * @return string
	 */
	public static function document_markup( string $theme_styles, string $tokens, string $nonce, string $canvas_url, string $lang, string $dir, ?\WP_Post $post = null, string $font_faces = '' ): string {
		$font_faces   = FontFaceCss::sanitize( $font_faces, (string) ( \function_exists( 'home_url' ) ? \home_url( '/' ) : 'https://example.test/' ) );
		$post         = $post ?? new \WP_Post(
			(object) [
				'ID'          => 1,
				'post_type'   => 'page',
				'post_status' => 'publish',
			]
		);
		$shell        = PageShell::for_post( $post );
		$document     = PageShell::document_wrapper( '<div id="blx-canvas-root" data-blx-mode="light"></div>' );
		$body_classes = \implode( ' ', \array_map( '\esc_attr', $shell['body_classes'] ) );
		return '<!doctype html><html lang="' . \esc_attr( $lang ) . '" dir="' . \esc_attr( $dir ) . '" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex,nofollow"><meta name="blixis-canvas" content="' . \esc_attr(
			self::meta_json(
				[
					'version'  => 1,
					'cspNonce' => $nonce,
				]
			)
		) . '">' . $theme_styles . ( '' !== $font_faces ? '<style class="wp-fonts-local" nonce="' . \esc_attr( $nonce ) . '">' . $font_faces . '</style>' : '' ) . '<style nonce="' . \esc_attr( $nonce ) . '">' . $tokens . '</style></head><body class="' . $body_classes . '">' . $shell['open'] . '<div class="entry-content">' . $document . '</div>' . $shell['close'] . '<script data-blx-canvas src="' . \esc_url( $canvas_url ) . '" nonce="' . \esc_attr( $nonce ) . '" defer></script></body></html>'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript -- Standalone document includes only its explicit trusted runtime.
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
