<?php
/**
 * Native path-prefix locale routing.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

use Blixis\Builder\Frontend\PublishedReader;
use Blixis\Builder\Storage\MetaRegistration;
use Blixis\Builder\Storage\WpdbDatabase;

\defined( 'ABSPATH' ) || exit;

/**
 * Default locale at the canonical URLs, other locales under a prefix (`/nl/about/`), same slug everywhere (ADR 0006).
 * The prefix is removed from the request before WordPress parses it, so no rewrite rules need flushing and plain permalinks
 * work too; generated URLs get the prefix back through the `home_url` filter. A locale that is not published for a page is a
 * 404 produced before WordPress canonical redirects can rewrite the URL.
 */
final class NativeLocaleRouter implements LocaleRouter {
	/**
	 * The active router, set by boot().
	 *
	 * @var ?self
	 */
	private static ?self $instance = null;

	/**
	 * Locale of this request when it came in under a prefix.
	 *
	 * @var ?string
	 */
	private ?string $route_locale = null;

	/**
	 * Create the router.
	 *
	 * @param LocaleConfig $config Site languages.
	 */
	public function __construct( private readonly LocaleConfig $config ) {}

	/** Read the configuration, strip a locale prefix from the request and register the hooks (multilingual sites only). */
	public static function boot(): void {
		$config = LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() );
		if ( ! $config->is_multilingual() ) {
			return;
		}
		self::$instance = new self( $config );
		self::$instance->strip_prefix();
		\add_filter( 'locale', [ self::$instance, 'filter_locale' ], 1 );
		\add_filter( 'home_url', [ self::$instance, 'filter_home_url' ], 20 );
		\add_filter( 'language_attributes', [ self::$instance, 'filter_language_attributes' ], 20 );
		\add_filter( 'redirect_canonical', [ self::$instance, 'filter_redirect_canonical' ], 1 );
		\add_action( 'wp', [ self::$instance, 'gate' ], 1 );
		\add_action( 'wp_head', [ self::$instance, 'print_alternates' ], 2 );
	}

	/**
	 * The active router, if the site is multilingual.
	 *
	 * @return ?LocaleRouter
	 */
	public static function instance(): ?LocaleRouter {
		return self::$instance;
	}

	/**
	 * The site languages.
	 *
	 * @return LocaleConfig
	 */
	public function config(): LocaleConfig {
		return $this->config;
	}

	/**
	 * The locale of the current request.
	 *
	 * @return string
	 */
	public function current(): string {
		return $this->route_locale ?? $this->config->default_locale;
	}

	/**
	 * Missing-translation policy.
	 *
	 * @return string
	 */
	public function fallback_policy(): string {
		return $this->config->fallback;
	}

	/**
	 * Whether a post has published content in a locale.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $locale Locale.
	 * @return bool
	 */
	public function is_published( int $post_id, string $locale ): bool {
		return \in_array( $locale, $this->published( $post_id ), true );
	}

	/**
	 * Absolute URL of a post in a locale.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $locale Locale.
	 * @return ?string
	 */
	public function url_for( int $post_id, string $locale ): ?string {
		if ( ! $this->is_published( $post_id, $locale ) ) {
			return null;
		}
		$permalink = \get_permalink( $post_id );
		if ( ! \is_string( $permalink ) ) {
			return null;
		}
		$prefix = $this->config->prefixes()[ $locale ] ?? '';
		return RoutePath::localize_url( $permalink, (string) \get_option( 'home' ), $prefix, $this->config );
	}

	/**
	 * Alternate-language links (hreflang).
	 *
	 * @param int $post_id Post ID.
	 * @return list<array{hreflang: string, href: string}>
	 */
	public function alternates( int $post_id ): array {
		$urls = [];
		foreach ( $this->config->enabled as $locale ) {
			$url = $this->url_for( $post_id, $locale );
			if ( null !== $url ) {
				$urls[ $locale ] = $url;
			}
		}
		return Alternates::links( $urls, $this->config->default_locale );
	}

	/**
	 * Published locales of a post that are also enabled.
	 *
	 * @param int $post_id Post ID.
	 * @return list<string>
	 */
	private function published( int $post_id ): array {
		global $wpdb;
		if ( ! \in_array( \get_post_type( $post_id ), MetaRegistration::post_types(), true ) ) {
			return [];
		}
		$locales = ( new PublishedReader( new WpdbDatabase( $wpdb ) ) )->published_locales( $post_id );
		return \array_values( \array_intersect( $this->config->enabled, $locales ) );
	}

	/** Detect a locale prefix and remove it from the request URI. */
	private function strip_prefix(): void {
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) \wp_unslash( $_SERVER['REQUEST_URI'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Only split into path and query; the path is matched against known prefixes.
		$path = (string) \wp_parse_url( $uri, PHP_URL_PATH );
		$home = (string) \wp_parse_url( (string) \get_option( 'home' ), PHP_URL_PATH );
		$rest = RoutePath::below_home( $path, $home );
		$hit  = null === $rest ? null : RoutePath::split( $rest, $this->config );
		if ( null === $hit || RoutePath::is_reserved( $hit['path'] ) ) {
			return;
		}
		$this->route_locale     = $hit['locale'];
		$query                  = \wp_parse_url( $uri, PHP_URL_QUERY );
		$_SERVER['REQUEST_URI'] = \rtrim( $home, '/' ) . $hit['path'] . ( \is_string( $query ) && '' !== $query ? '?' . $query : '' );
	}

	/**
	 * Use the route locale on the public site.
	 *
	 * @param string $locale Locale.
	 * @return string
	 */
	public function filter_locale( string $locale ): string {
		return null !== $this->route_locale && ! \is_admin() ? $this->route_locale : $locale;
	}

	/**
	 * Keep visitors inside their language: generated site URLs get the prefix.
	 *
	 * @param string $url Absolute URL.
	 * @return string
	 */
	public function filter_home_url( string $url ): string {
		if ( null === $this->route_locale || \is_admin() ) {
			return $url;
		}
		return RoutePath::localize_url( $url, (string) \get_option( 'home' ), $this->config->prefixes()[ $this->route_locale ] ?? '', $this->config );
	}

	/**
	 * Set `lang` and `dir` from the content locale.
	 *
	 * @param string $attributes Attributes string.
	 * @return string
	 */
	public function filter_language_attributes( string $attributes ): string {
		if ( null === $this->route_locale || \is_admin() ) {
			return $attributes;
		}
		$attributes = (string) \preg_replace( '/\s*\bdir="[^"]*"/', '', $attributes );
		return Direction::is_rtl( $this->route_locale ) ? $attributes . ' dir="rtl"' : $attributes;
	}

	/**
	 * Locale URLs are never rewritten by canonical redirects (the 404 decision comes first).
	 *
	 * @param string|false $redirect Redirect target.
	 * @return string|false
	 */
	public function filter_redirect_canonical( string|false $redirect ): string|false {
		return null === $this->route_locale ? $redirect : false;
	}

	/** A locale that is not published for the requested page is a 404. */
	public function gate(): void {
		if ( null === $this->route_locale || \is_404() ) {
			return;
		}
		$post = \is_singular() ? \get_queried_object() : null;
		if ( $post instanceof \WP_Post && $this->is_published( $post->ID, $this->route_locale ) ) {
			return;
		}
		global $wp_query;
		$wp_query->set_404();
		\status_header( 404 );
		\nocache_headers();
	}

	/** Print hreflang alternates for a singular page with at least one published locale. */
	public function print_alternates(): void {
		$post = \is_singular() ? \get_queried_object() : null;
		if ( ! $post instanceof \WP_Post ) {
			return;
		}
		foreach ( $this->alternates( $post->ID ) as $link ) {
			echo '<link rel="alternate" hreflang="' . \esc_attr( $link['hreflang'] ) . '" href="' . \esc_url( $link['href'] ) . "\" />\n";
		}
	}
}
