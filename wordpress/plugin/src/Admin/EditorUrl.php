<?php
/**
 * Editor URL construction.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

\defined( 'ABSPATH' ) || exit;

/** Builds the isolated editor's admin URL. */
final class EditorUrl {
	/**
	 * Build a URL for a post.
	 *
	 * @param int     $post_id Post ID.
	 * @param ?string $locale Content locale.
	 * @return string
	 */
	public static function for_post( int $post_id, ?string $locale = null ): string {
		$args = [
			'page' => 'blixis-editor',
			'post' => $post_id,
		];
		if ( null !== $locale ) {
			$args['locale'] = $locale;
		}
		return (string) \add_query_arg( $args, \admin_url( 'admin.php' ) );
	}

	/**
	 * Pure URL builder used to verify the query contract without WordPress.
	 *
	 * @param string  $base_url Admin URL.
	 * @param int     $post_id Post ID.
	 * @param ?string $locale Optional locale.
	 * @return string
	 */
	public static function build( string $base_url, int $post_id, ?string $locale = null ): string {
		$args = [
			'page' => 'blixis-editor',
			'post' => $post_id,
		];
		if ( null !== $locale ) {
			$args['locale'] = $locale;
		}
		$separator = false === \strpos( $base_url, '?' ) ? '?' : '&';
		return $base_url . $separator . \http_build_query( $args, '', '&', PHP_QUERY_RFC3986 );
	}
}
