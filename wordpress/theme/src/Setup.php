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
		return [
			'automatic-feed-links' => true,
			'title-tag'            => true,
			'post-thumbnails'      => true,
			'responsive-embeds'    => true,
			'html5'                => [ 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' ],
		];
	}

	/**
	 * Return the shared singular article and main shell descriptor.
	 *
	 * @param \WP_Post|null $post Current post.
	 * @return array{open: string, close: string, body_classes: list<string>}
	 */
	public static function page_shell( ?\WP_Post $post ): array {
		$id     = null === $post ? 0 : (int) $post->ID;
		$type   = null === $post ? 'page' : \sanitize_html_class( $post->post_type );
		$status = null === $post ? 'publish' : \sanitize_html_class( $post->post_status );
		$base   = [
			'open'         => '<main id="content" class="site-main site-shell" tabindex="-1"><article id="post-' . $id . '" class="post-' . $id . ' ' . $type . ' type-' . $type . ' status-' . $status . ' hentry">',
			'close'        => '</article></main>',
			'body_classes' => \get_body_class(),
		];
		$shell  = \apply_filters(
			'blixis_builder_page_shell',
			$base,
			$post ?? new \WP_Post(
				(object) [
					'ID'          => 0,
					'post_type'   => 'page',
					'post_status' => 'publish',
				]
			)
		);
		if ( ! \is_array( $shell ) || ! isset( $shell['open'], $shell['close'], $shell['body_classes'] ) || ! \is_string( $shell['open'] ) || ! \is_string( $shell['close'] ) || ! \is_array( $shell['body_classes'] ) ) {
			return $base;
		}
		$classes = [];
		foreach ( $shell['body_classes'] as $class ) {
			if ( \is_string( $class ) ) {
				$classes[] = $class;
			}
		}
		return [
			'open'         => $shell['open'],
			'close'        => $shell['close'],
			'body_classes' => $classes,
		];
	}

	/**
	 * Hooks everything up. Called once from functions.php.
	 *
	 * @return void
	 */
	public static function register(): void {
		add_action( 'after_setup_theme', [ self::class, 'setup' ] );
		add_action( 'wp_enqueue_scripts', [ self::class, 'enqueue' ] );
		add_filter( 'language_attributes', [ Appearance::class, 'filter_language_attributes' ] );
		add_action( 'wp_head', [ Appearance::class, 'print_meta' ], 1 );
		add_action( 'after_switch_theme', [ SetupState::class, 'activate' ] );
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
		register_nav_menus( [ 'primary' => __( 'Primary menu', 'blixis' ) ] );
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
		if ( 'auto' === Appearance::site_mode() ) {
			wp_enqueue_script(
				'blixis-appearance',
				get_template_directory_uri() . '/assets/js/appearance.js',
				[],
				$version,
				[
					'in_footer' => true,
					'strategy'  => 'defer',
				]
			);
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
		$parent_style = $template_uri . '/style.css';
		$is_child     = $stylesheet_uri !== $parent_style;
		$styles       = [
			$is_child ? 'blixis-parent-style' : 'blixis-style' => [
				'url'          => $parent_style,
				'dependencies' => [],
				'version'      => $version,
			],
		];
		$styles      += [
			'blixis-tokens' => [
				'url'          => $template_uri . '/assets/css/tokens.css',
				'dependencies' => [ $is_child ? 'blixis-parent-style' : 'blixis-style' ],
				'version'      => $version,
			],
			'blixis-theme'  => [
				'url'          => $template_uri . '/assets/css/theme.css',
				'dependencies' => [ 'blixis-tokens' ],
				'version'      => $version,
			],
		];
		if ( $is_child ) {
			$styles['blixis-style'] = [
				'url'          => $stylesheet_uri,
				'dependencies' => [ 'blixis-theme' ],
				'version'      => $version,
			];
		}
		return $styles;
	}
}
