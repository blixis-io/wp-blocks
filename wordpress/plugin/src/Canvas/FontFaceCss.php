<?php
/**
 * Same-origin WordPress font faces for the isolated canvas.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Canvas;

\defined( 'ABSPATH' ) || exit;

/** Obtains the core Font Library output and retains only safe @font-face rules. */
final class FontFaceCss {
	/**
	 * Capture WordPress's normal font-face printer, shared with the front end.
	 *
	 * @return string Safe CSS rules, or an empty string when core cannot print faces.
	 */
	public static function from_wordpress(): string {
		if ( ! \function_exists( 'wp_print_font_faces' ) ) {
			return '';
		}
		\ob_start();
		try {
			\wp_print_font_faces();
			$output = \ob_get_contents();
		} finally {
			\ob_end_clean();
		}
		return \is_string( $output ) ? self::sanitize( $output, (string) \home_url( '/' ) ) : '';
	}

	/**
	 * Keep only @font-face blocks containing exclusively same-origin URL sources.
	 *
	 * @param string $output WordPress's style.wp-fonts-local output or CSS.
	 * @param string $site_url Site URL used as the allowed origin.
	 */
	public static function sanitize( string $output, string $site_url ): string {
		$origin = \parse_url( $site_url ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url -- Only the scheme, host and port tuple is compared; wp_parse_url has the same tuple semantics here.
		if ( ! \is_array( $origin ) || ! isset( $origin['scheme'], $origin['host'] ) || ! \in_array( \strtolower( $origin['scheme'] ), [ 'http', 'https' ], true ) ) {
			return '';
		}
		$output = \preg_replace( '/^\s*<style\b[^>]*>|<\/style>\s*$/i', '', $output ) ?? '';
		if ( '' === $output || \str_contains( $output, '\\' ) || \str_contains( $output, '/*' ) || \str_contains( $output, '*/' ) ) {
			return '';
		}
		\preg_match_all( '/@font-face\s*\{([^{}]*)\}/i', $output, $matches, PREG_SET_ORDER );
		$residual = \preg_replace( '/@font-face\s*\{[^{}]*\}/i', '', $output );
		if ( ! \is_array( $matches ) || '' !== \trim( (string) $residual ) ) {
			return '';
		}
		$rules = [];
		foreach ( $matches as $match ) {
			$body = $match[1];
			if ( 1 !== \preg_match( '/(?:^|;)\s*src\s*:\s*([^;]+)\s*(?:;|$)/i', $body, $source ) ) {
				continue;
			}
			$urls = [];
			\preg_match_all( '/url\(\s*[\"\']?([^\"\')]+)[\"\']?\s*\)/i', $source[1], $urls );
			if ( empty( $urls[1] ) || ! self::all_same_origin( $urls[1], $origin ) ) {
				continue;
			}
			$all_urls = [];
			\preg_match_all( '/url\(\s*[\"\']?([^\"\')]+)[\"\']?\s*\)/i', $body, $all_urls );
			if ( \preg_match_all( '/url\s*\(/i', $body ) !== \count( $all_urls[1] ) || $all_urls[1] !== $urls[1] ) {
				continue;
			}
			$rules[] = $match[0];
		}
		return \implode( "\n", $rules );
	}

	/**
	 * Check each source URL against the site's exact origin.
	 *
	 * @param array<string>        $urls   Candidate font URLs.
	 * @param array<string, mixed> $origin Site origin parts.
	 */
	private static function all_same_origin( array $urls, array $origin ): bool {
		foreach ( $urls as $url ) {
			$url = \trim( $url );
			if ( '' === $url || '#' === $url[0] || 1 === \preg_match( '/[\x00-\x20\\\\]/', $url ) ) {
				return false;
			}
			$parts = \parse_url( $url ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url -- Only the scheme, host and port tuple is compared; wp_parse_url has the same tuple semantics here.
			if ( ! \is_array( $parts ) ) {
				return false;
			}
			if ( isset( $parts['scheme'] ) || isset( $parts['host'] ) ) {
				if ( ! isset( $parts['scheme'], $parts['host'] ) || \strtolower( $parts['scheme'] ) !== \strtolower( $origin['scheme'] ) || \strtolower( $parts['host'] ) !== \strtolower( $origin['host'] ) || ( $parts['port'] ?? null ) !== ( $origin['port'] ?? null ) ) {
					return false;
				}
			} elseif ( ! isset( $parts['path'] ) || ! \str_starts_with( $parts['path'], '/' ) ) {
				return false;
			}
		}
		return true;
	}
}
