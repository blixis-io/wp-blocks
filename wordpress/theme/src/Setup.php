<?php
/**
 * Theme setup: supported features, menus and the stylesheet.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/**
 * Registers the theme's WordPress hooks.
 */
final class Setup {

	/**
	 * Theme features, as `add_theme_support` arguments.
	 *
	 * @return array<string, mixed> Feature name => argument (true for none).
	 */
	public static function features(): array {
		return array(
			'automatic-feed-links' => true,
			'title-tag'            => true,
			'post-thumbnails'      => true,
			'responsive-embeds'    => true,
			'html5'                => array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' ),
		);
	}

	/**
	 * Hooks everything up. Called once from functions.php.
	 *
	 * @return void
	 */
	public static function register(): void {
		add_action( 'after_setup_theme', array( self::class, 'setup' ) );
		add_action( 'wp_enqueue_scripts', array( self::class, 'enqueue' ) );
		add_action( 'after_switch_theme', array( SetupState::class, 'activate' ) );
		SetupAdmin::register();
	}

	/**
	 * Declares supported features, the text domain and the primary menu.
	 *
	 * @return void
	 */
	public static function setup(): void {
		load_theme_textdomain( 'blixis', get_template_directory() . '/languages' );
		foreach ( self::features() as $feature => $argument ) {
			if ( true === $argument ) {
				add_theme_support( $feature );
			} else {
				add_theme_support( $feature, $argument );
			}
		}
		register_nav_menus( array( 'primary' => __( 'Primary menu', 'blixis' ) ) );
		if ( ! isset( $GLOBALS['content_width'] ) ) {
			$GLOBALS['content_width'] = 720; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Documented classic theme setting.
		}
	}

	/**
	 * Loads the theme header, design tokens and compiled utilities, versioned by the theme version.
	 *
	 * @return void
	 */
	public static function enqueue(): void {
		$version = wp_get_theme()->get( 'Version' );
		if ( false === $version ) {
			return;
		}
		foreach ( self::styles( get_stylesheet_uri(), get_template_directory_uri(), $version ) as $handle => $style ) {
			wp_enqueue_style( $handle, $style['url'], $style['dependencies'], $style['version'] );
		}
		// The saved design system overrides the bundled defaults: same layer, printed after the static file.
		$saved = DesignSystemStore::current();
		if ( null !== $saved ) {
			$css = DesignSystemStore::css( $saved['tokens'] );
			if ( '' !== $css ) {
				wp_add_inline_style( 'blixis-tokens', $css );
			}
		}
	}

	/**
	 * Describes the styles in enqueue order.
	 *
	 * @param string $stylesheet_uri Active theme stylesheet URL.
	 * @param string $template_uri   Parent theme directory URL.
	 * @param string $version        Theme version.
	 * @return array<string, array{url: string, dependencies: list<string>, version: string}> Styles by handle.
	 */
	public static function styles( string $stylesheet_uri, string $template_uri, string $version ): array {
		return array(
			'blixis-style'  => array(
				'url'          => $stylesheet_uri,
				'dependencies' => array(),
				'version'      => $version,
			),
			'blixis-tokens' => array(
				'url'          => $template_uri . '/assets/css/tokens.css',
				'dependencies' => array( 'blixis-style' ),
				'version'      => $version,
			),
			'blixis-theme'  => array(
				'url'          => $template_uri . '/assets/css/theme.css',
				'dependencies' => array( 'blixis-tokens' ),
				'version'      => $version,
			),
		);
	}
}
