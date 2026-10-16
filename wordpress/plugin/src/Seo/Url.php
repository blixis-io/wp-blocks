<?php
/**
 * Same-origin URL policy for SEO fields.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Seo;

\defined( 'ABSPATH' ) || exit;
/** URL validation shared by writes and rendering. */
final class Url {
	/**
	 * Accept an empty URL or an absolute HTTP(S) URL with the exact site origin.
	 *
	 * @param string $url Candidate URL.
	 */
	public static function same_origin_http( string $url ): bool {
		if ( '' === $url ) {
			return true; }
		$a = \wp_parse_url( $url );
		$b = \wp_parse_url( \home_url() );
		return \is_array( $a ) && \is_array( $b )
			&& \in_array( \strtolower( (string) ( $a['scheme'] ?? '' ) ), [ 'http', 'https' ], true )
			&& \strtolower( (string) ( $a['scheme'] ?? '' ) ) === \strtolower( (string) ( $b['scheme'] ?? '' ) )
			&& isset( $a['host'], $b['host'] ) && 0 === \strcasecmp( (string) $a['host'], (string) $b['host'] )
			&& (int) ( $a['port'] ?? 0 ) === (int) ( $b['port'] ?? 0 )
			&& ! isset( $a['user'] ) && ! isset( $a['pass'] ) && ! isset( $a['fragment'] );
	}
}
