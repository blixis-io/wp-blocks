<?php
/**
 * Theme setup: supported features, menus and the stylesheet.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

defined( 'ABSPATH' ) || exit;

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
	 * Loads the theme stylesheet, versioned by the theme version.
	 *
	 * @return void
	 */
	public static function enqueue(): void {
		wp_enqueue_style( 'blixis-style', get_stylesheet_uri(), array(), wp_get_theme()->get( 'Version' ) );
	}
}
