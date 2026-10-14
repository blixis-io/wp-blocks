<?php
/**
 * Minimal WordPress REST response fixture.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound -- WordPress test stub.
/** Minimal response with observable headers. */
class WP_REST_Response {
	/** Response headers.
	 *
	 * @var array<string, string>
	 */
	public array $headers = [];
	/** Construct a response.
	 *
	 * @param mixed $data Response data.
	 * @param int   $status HTTP status.
	 */
	public function __construct( public mixed $data, public int $status ) {}
	/** Set a response header.
	 *
	 * @param string $name Header name.
	 * @param string $value Header value.
	 */
	public function header( string $name, string $value ): void {
		$this->headers[ $name ] = $value;
	}
}
// phpcs:enable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound
