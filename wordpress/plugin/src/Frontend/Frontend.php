<?php
/**
 * Public rendering of published builder pages.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

use Blixis\Builder\Css\Compiler;
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
	 * @var array<int, ?array{html: string, css: string}>
	 */
	private static array $memo = [];

	/** Register the hooks. */
	public static function hooks(): void {
		Invalidation::hooks();
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
		if ( '' !== $page['css'] ) {
			\wp_register_style( self::STYLE_HANDLE, false, [], \Blixis\Builder\VERSION );
			\wp_enqueue_style( self::STYLE_HANDLE );
			\wp_add_inline_style( self::STYLE_HANDLE, $page['css'] );
		}
		if ( ! ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status()->compatible ) {
			\wp_register_style( 'blixis-builder-fallback', false, [], \Blixis\Builder\VERSION );
			\wp_enqueue_style( 'blixis-builder-fallback' );
			\wp_add_inline_style( 'blixis-builder-fallback', FallbackCss::css() );
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
		return null === $page ? $content : '<div class="blx-page" data-blx-document>' . $page['html'] . '</div>';
	}

	/**
	 * Forget a deleted post's memoized output.
	 *
	 * @param int $post_id Post ID.
	 * @return void
	 */
	public static function forget( int $post_id ): void {
		unset( self::$memo[ $post_id ] );
	}

	/**
	 * Rendered output for a post, cached by every input that changes it.
	 *
	 * @param int $post_id Post ID.
	 * @return ?array{html: string, css: string}
	 */
	private static function page_for( int $post_id ): ?array {
		if ( array_key_exists( $post_id, self::$memo ) ) {
			return self::$memo[ $post_id ];
		}
		self::$memo[ $post_id ] = null;
		/**
		 * Disable builder output on the public site (for debugging or emergency fallback to the plain post content).
		 *
		 * @param bool $enabled Whether builder output is used.
		 */
		if ( $post_id < 1 || ! \apply_filters( 'blixis_builder_render_frontend', true ) || ! \in_array( \get_post_type( $post_id ), MetaRegistration::post_types(), true ) ) {
			return null;
		}
		global $wpdb;
		$reader    = new PublishedReader( new WpdbDatabase( $wpdb ) );
		$published = $reader->read( $post_id, \get_locale() );
		if ( null === $published ) {
			return null;
		}
		$theme = \wp_get_theme();
		// The reason distinguishes changed declarations even if the stylesheet version was not bumped.
		$reason = ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status()->reason;
		$key    = RenderCacheKey::build( $post_id, $published->locale, $published->layout_revision, $published->content_revision, Invalidation::epoch(), Compiler::COMPILER_VERSION, \Blixis\Builder\VERSION, $theme->get_stylesheet() . '@' . (string) $theme->get( 'Version' ), $reason );
		$cache  = new TransientRenderCache();
		$page   = $cache->get( $key );
		if ( null === $page ) {
			$renderer = new PageRenderer( new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \Blixis\Builder\DIR . '/data/core-elements.json' ), new WordPressMediaResolver() ) );
			$page     = $renderer->render( $published );
			if ( null === $page ) {
				return null;
			}
			$cache->set( $key, $page );
		}
		self::$memo[ $post_id ] = $page;
		return $page;
	}
}
