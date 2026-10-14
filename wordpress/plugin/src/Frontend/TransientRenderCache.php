<?php
/**
 * WordPress transient implementation of the render cache.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** Uses transients, so a persistent object cache is used automatically when present. */
final class TransientRenderCache implements RenderCache {
	private const TTL = 86400;

	/**
	 * Read an entry.
	 *
	 * @param string $key Cache key.
	 * @return ?array{html: string, css: string}
	 */
	public function get( string $key ): ?array {
		$value = \get_transient( $key );
		return \is_array( $value ) && \is_string( $value['html'] ?? null ) && \is_string( $value['css'] ?? null ) ? [
			'html' => $value['html'],
			'css'  => $value['css'],
		] : null;
	}

	/**
	 * Store an entry.
	 *
	 * @param string                           $key Cache key.
	 * @param array{html: string, css: string} $value Rendered page.
	 * @return void
	 */
	public function set( string $key, array $value ): void {
		\set_transient( $key, $value, self::TTL );
	}
}
