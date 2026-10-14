<?php
/**
 * Storage for rendered pages.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** A small key-value store; entries are immutable per key, so no per-entry invalidation is needed. */
interface RenderCache {
	/**
	 * Read an entry.
	 *
	 * @param string $key Cache key.
	 * @return ?array{html: string, css: string}
	 */
	public function get( string $key ): ?array;

	/**
	 * Store an entry.
	 *
	 * @param string                           $key Cache key.
	 * @param array{html: string, css: string} $value Rendered page.
	 * @return void
	 */
	public function set( string $key, array $value ): void;
}
