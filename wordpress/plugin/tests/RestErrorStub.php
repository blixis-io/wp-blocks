<?php
/**
 * Minimal WordPress error for isolated document tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound -- WordPress test stub.
/** Safe error shape used by the document controller. */
class WP_Error {
	/**
	 * Create a WordPress-style error.
	 *
	 * @param string               $code Error code.
	 * @param string               $message Safe message.
	 * @param array<string, mixed> $data Error metadata.
	 */
	public function __construct( public string $code, public string $message, public array $data ) {}
}
// phpcs:enable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound
