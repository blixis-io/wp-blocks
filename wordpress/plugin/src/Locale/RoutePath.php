<?php
/**
 * Pure URL path handling for locale prefixes.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

\defined( 'ABSPATH' ) || exit;

/** Splits and builds `/nl/about/` style paths. No WordPress calls, never throws. */
final class RoutePath {
	/**
	 * Paths WordPress itself owns; they never get a locale prefix.
	 */
	public const RESERVED = [ 'wp-admin', 'wp-json', 'wp-content', 'wp-includes', 'wp-login.php', 'wp-cron.php', 'xmlrpc.php', 'wp-sitemap.xml', 'feed', 'robots.txt', 'favicon.ico' ];

	/**
	 * Split a request path into locale and the rest.
	 *
	 * @param string       $path Request path relative to the site root, such as `/nl/about/`.
	 * @param LocaleConfig $config Site languages.
	 * @return ?array{locale: string, path: string} Null when the path has no known prefix.
	 */
	public static function split( string $path, LocaleConfig $config ): ?array {
		// One leading slash exactly: `//nl/x` is not a locale route (and could be read as a protocol-relative URL).
		if ( '' === $path || '/' !== $path[0] || 0 === \strpos( $path, '//' ) ) {
			return null;
		}
		$trimmed = \substr( $path, 1 );
		$segment = \explode( '/', $trimmed, 2 );
		$locale  = $config->locale_for_prefix( $segment[0] );
		if ( null === $locale ) {
			return null;
		}
		$rest = $segment[1] ?? '';
		return [
			'locale' => $locale,
			'path'   => '/' . $rest,
		];
	}

	/**
	 * Put a prefix in front of a path.
	 *
	 * @param string $path Path starting with `/`.
	 * @param string $prefix Locale prefix.
	 * @return string
	 */
	public static function add( string $path, string $prefix ): string {
		return '/' . $prefix . ( '' === $path || '/' === $path ? '/' : $path );
	}

	/**
	 * Whether a path belongs to WordPress itself (admin, REST, assets, login ...).
	 *
	 * @param string $path Path starting with `/`.
	 * @return bool
	 */
	public static function is_reserved( string $path ): bool {
		$first = \explode( '/', \ltrim( $path, '/' ), 2 )[0];
		return \in_array( \strtolower( $first ), self::RESERVED, true );
	}

	/**
	 * Remove the site's own sub-directory from a request path.
	 *
	 * @param string $request_path Path from the request URI (no query string).
	 * @param string $home_path Path of the home URL (`''` or `/blog`).
	 * @return ?string The path below the site root, or null when the request is outside the site.
	 */
	public static function below_home( string $request_path, string $home_path ): ?string {
		$home = \rtrim( $home_path, '/' );
		if ( '' === $home ) {
			return $request_path;
		}
		if ( $request_path === $home ) {
			return '/';
		}
		return 0 === \strpos( $request_path, $home . '/' ) ? \substr( $request_path, \strlen( $home ) ) : null;
	}

	/**
	 * Put a locale prefix into an absolute site URL (or move it to another locale), leaving reserved paths and URLs of other
	 * sites alone.
	 *
	 * @param string       $url Absolute URL.
	 * @param string       $home Home URL without trailing slash.
	 * @param string       $prefix Target prefix, or empty for the default locale.
	 * @param LocaleConfig $config Site languages (to recognise an existing prefix).
	 * @return string
	 */
	public static function localize_url( string $url, string $home, string $prefix, LocaleConfig $config ): string {
		$home = \rtrim( $home, '/' );
		if ( 0 !== \strpos( $url, $home ) ) {
			return $url;
		}
		$rest = \substr( $url, \strlen( $home ) );
		if ( '' !== $rest && ! \in_array( $rest[0], [ '/', '?', '#' ], true ) ) {
			return $url;
		}
		$split_at = \strcspn( $rest, '?#' );
		$path     = \substr( $rest, 0, $split_at );
		$tail     = \substr( $rest, $split_at );
		if ( 1 === \preg_match( '/(?:^|[?&])rest_route=/', $tail ) ) {
			return $url;
		}
		$path    = '' === $path ? '/' : $path;
		$current = self::split( $path, $config );
		if ( null !== $current ) {
			$path = $current['path'];
		}
		if ( self::is_reserved( $path ) ) {
			return $url;
		}
		return $home . ( '' === $prefix ? $path : self::add( $path, $prefix ) ) . $tail;
	}
}
