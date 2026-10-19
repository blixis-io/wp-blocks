<?php
/**
 * Public rendering of published builder pages.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

use Blixis\Builder\Css\Compiler;
use Blixis\Builder\Canvas\PageShell;
use Blixis\Builder\Locale\NativeLocaleRouter;
use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Render\CoreDocumentRenderer;
use Blixis\Builder\Render\WordPressMediaResolver;
use Blixis\Builder\Storage\MetaRegistration;
use Blixis\Builder\Storage\WpdbDatabase;
use Blixis\Builder\Theme\ThemeCompat;
use Blixis\Builder\Theme\WordPressCompatibilityReader;

\defined( 'ABSPATH' ) || exit;

/**
 * Replaces the content of a singular post with its published builder output and prints the compiled CSS in one inline
 * style. Posts without a valid publication pointer are untouched, which is also the fallback for every failure.
 */
final class Frontend {
	private const STYLE_HANDLE = 'blixis-builder-frontend';

	/**
	 * Rendered pages of this request by post ID (null = not a builder page).
	 *
	 * @var array<string, ?array{html: string, css: string}>
	 */
	private static array $memo = [];

	/** Register the hooks. */
	public static function hooks(): void {
		Invalidation::hooks();
		DraftPreview::hooks();
		\add_action( 'wp_enqueue_scripts', [ self::class, 'enqueue_style' ] );
		\add_filter( 'the_content', [ self::class, 'filter_content' ], 99 );
		\add_action( 'deleted_post', [ self::class, 'forget' ] );
	}

	/**
	 * Print the compiled stylesheet for the queried post.
	 *
	 * @return void
	 */
	public static function enqueue_style(): void {
		$page = self::page_for( (int) \get_queried_object_id() );
		if ( null === $page ) {
			return;
		}
		$has_resizable_panels = str_contains( $page['html'], 'data-blx-resizable-panels=' );
		$has_marquee          = str_contains( $page['html'], 'data-blx-marquee=' );
		$has_lightbox         = str_contains( $page['html'], 'data-blx-lightbox-gallery' );
		$has_comparison       = str_contains( $page['html'], 'data-blx-image-comparison' );
		$has_map              = str_contains( $page['html'], 'data-blx-map' );
		$has_image_hotspots   = str_contains( $page['html'], 'data-blx-image-hotspots' );
		$has_panorama         = str_contains( $page['html'], 'data-blx-panorama' );
		$has_disclosures      = str_contains( $page['html'], 'data-blx-accordion' ) || str_contains( $page['html'], 'data-blx-tabs' );
		$has_navigation       = str_contains( $page['html'], 'data-blx-navigation' ) || str_contains( $page['html'], 'data-blx-mobile-menu' ) || str_contains( $page['html'], 'data-blx-sticky-header' ) || str_contains( $page['html'], 'data-blx-mega-menu' );
		$has_scroll_spy       = str_contains( $page['html'], 'data-blx-scroll-spy' );
		$has_offcanvas        = str_contains( $page['html'], 'data-blx-offcanvas' );
		$has_ui_runtime       = str_contains( $page['html'], 'data-blx-toggle' ) || str_contains( $page['html'], 'data-blx-slider' );
		$has_content_elements = str_contains( $page['html'], 'data-blx-code-block' ) || str_contains( $page['html'], 'data-blx-countdown' ) || str_contains( $page['html'], 'data-blx-animated-headline' ) || str_contains( $page['html'], 'data-blx-tooltip-text' ) || str_contains( $page['html'], 'data-blx-action=' ) || str_contains( $page['html'], 'data-blx-wizard-steps' ) || $has_lightbox || $has_comparison || $has_disclosures || $has_navigation || $has_offcanvas;
		$has_content_runtime  = str_contains( $page['html'], 'data-blx-code-block' ) || str_contains( $page['html'], 'data-blx-countdown' ) || str_contains( $page['html'], 'data-blx-action=' ) || $has_lightbox || $has_comparison;
		$inline_styles        = array_filter( [ $page['css'], $has_resizable_panels ? ResizablePanelsCss::css() : '', $has_marquee ? MarqueeCss::css() : '', $has_map ? MapCss::css() : '', $has_image_hotspots ? ImageHotspotsCss::css() : '', $has_panorama ? PanoramaCss::css() : '', $has_content_elements ? ContentElementsCss::css() : '' ] );
		if ( [] !== $inline_styles ) {
			\wp_register_style( self::STYLE_HANDLE, false, [], \Blixis\Builder\VERSION );
			\wp_enqueue_style( self::STYLE_HANDLE );
			\wp_add_inline_style( self::STYLE_HANDLE, implode( "\n", $inline_styles ) );
		}
		if ( $has_resizable_panels || $has_marquee || $has_content_runtime || $has_map || $has_panorama || $has_disclosures || $has_scroll_spy || $has_offcanvas || $has_ui_runtime ) {
			$asset_url = \plugins_url( 'assets/frontend/elements.js', \dirname( __DIR__, 2 ) . '/blixis-builder.php' );
			if ( '' !== $asset_url ) {
				\wp_register_script( 'blixis-builder-elements', $asset_url, [], \Blixis\Builder\VERSION, true );
				\wp_enqueue_script( 'blixis-builder-elements' );
			}
		}
		if ( ! ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status()->compatible ) {
			\wp_register_style( 'blixis-builder-fallback', false, [], \Blixis\Builder\VERSION );
			\wp_enqueue_style( 'blixis-builder-fallback' );
			\wp_add_inline_style( 'blixis-builder-fallback', FallbackCss::css() );
		}
		if ( DraftPreview::active() ) {
			// The badge has its own handle so a compatible theme renders the preview exactly like the published page.
			\wp_register_style( 'blixis-builder-draft-preview', false, [], \Blixis\Builder\VERSION );
			\wp_enqueue_style( 'blixis-builder-draft-preview' );
			\wp_add_inline_style( 'blixis-builder-draft-preview', '.blx-draft-preview-badge{position:fixed;z-index:2147483647;inset:auto 1rem 1rem auto;padding:.4rem .65rem;border-radius:.35rem;background:#1f2937;color:#fff;font:600 12px/1.2 system-ui,sans-serif;box-shadow:0 2px 8px #0004}' );
		}
	}

	/**
	 * Swap the post content for the published output.
	 *
	 * @param string $content Original content.
	 * @return string
	 */
	public static function filter_content( string $content ): string {
		if ( ! \is_singular() || ! \in_the_loop() || ! \is_main_query() || \is_feed() || \post_password_required() ) {
			return $content;
		}
		$post_id = (int) \get_the_ID();
		if ( (int) \get_queried_object_id() !== $post_id ) {
			return $content;
		}
		$page = self::page_for( $post_id );
		return null === $page ? $content : PageShell::document_wrapper( $page['html'] );
	}

	/**
	 * Forget a deleted post's memoized output.
	 *
	 * @param int $post_id Post ID.
	 * @return void
	 */
	public static function forget( int $post_id ): void {
		unset( self::$memo[ 'public:' . $post_id ], self::$memo[ 'draft:' . $post_id ] );
	}

	/**
	 * Rendered output for a post, cached by every input that changes it.
	 *
	 * @param int $post_id Post ID.
	 * @return ?array{html: string, css: string}
	 */
	private static function page_for( int $post_id ): ?array {
		$draft    = DraftPreview::active();
		$memo_key = ( $draft ? 'draft:' : 'public:' ) . $post_id;
		if ( array_key_exists( $memo_key, self::$memo ) ) {
			return self::$memo[ $memo_key ];
		}
		self::$memo[ $memo_key ] = null;
		/**
		 * Disable builder output on the public site (for debugging or emergency fallback to the plain post content).
		 *
		 * @param bool $enabled Whether builder output is used.
		 */
		if ( $post_id < 1 || ! \apply_filters( 'blixis_builder_render_frontend', true ) || ! \in_array( \get_post_type( $post_id ), MetaRegistration::post_types(), true ) ) {
			return null;
		}
		global $wpdb;
		$router = NativeLocaleRouter::instance();
		if ( $draft ) {
			$config    = LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() );
			$published = ( new WorkingReader( new WpdbDatabase( $wpdb ) ) )->read( $post_id, \get_locale(), $config->default_locale );
		} else {
			$published = ( new PublishedReader( new WpdbDatabase( $wpdb ) ) )->read( $post_id, \get_locale() );
		}
		if ( null === $published ) {
			return null;
		}
		$fallback = null === $router ? 'source' : $router->fallback_policy();
		$theme    = \wp_get_theme();
		// The reason distinguishes changed declarations even if the stylesheet version was not bumped.
		$reason = ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status()->reason;
		$key    = RenderCacheKey::build( $post_id, $published->locale, $published->layout_revision, $published->content_revision, $published->default_content_revision, Invalidation::epoch(), Compiler::COMPILER_VERSION, \Blixis\Builder\VERSION, $theme->get_stylesheet() . '@' . (string) $theme->get( 'Version' ) . '|fallback=' . $fallback, $reason );
		$cache  = $draft ? null : new TransientRenderCache();
		$page   = null === $cache ? null : $cache->get( $key );
		if ( null === $page ) {
			$system    = \get_option( 'blixis_design_system', false );
			$token_map = \is_array( $system ) && \is_array( $system['tokens'] ?? null ) ? $system['tokens'] : [];
			$token_ids = [];
			$tokens    = [];
			foreach ( $token_map as $id => $token ) {
				if ( ! \is_string( $id ) || 1 !== \preg_match( '/^color-[a-z0-9]+(?:-[a-z0-9]+)*$/D', $id ) || ! \is_array( $token ) || ! \is_string( $token['value'] ?? null ) ) {
					continue;
				}
				$token_ids[] = $id;
				$tokens[]    = [
					'name'     => '--blx-' . $id,
					'value'    => $token['value'],
					'category' => 'color',
				];
				if ( \is_string( $token['dark'] ?? null ) && $token['dark'] !== $token['value'] ) {
					$tokens[] = [
						'name'     => '--blx-' . $id,
						'value'    => $token['dark'],
						'category' => 'color',
						'mode'     => 'dark',
					];
				}
			}
			$renderer = new PageRenderer( new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \Blixis\Builder\DIR . '/data/core-elements.json' ), new WordPressMediaResolver() ) );
			try {
				$page = $renderer->render( $published, $fallback, $token_ids, $tokens );
			} catch ( \Throwable ) {
				\error_log( 'Blixis public document rendering failed; falling back to post content.' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Content-free fatal-render fallback diagnostic.
				return null;
			}
			if ( null === $page ) {
				return null;
			}
			if ( null !== $cache ) {
				$cache->set( $key, $page );
			}
		}
		self::$memo[ $memo_key ] = $page;
		return $page;
	}
}
