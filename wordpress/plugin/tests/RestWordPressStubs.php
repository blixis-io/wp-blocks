<?php
/**
 * Minimal WordPress REST types for isolated permission tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

require_once __DIR__ . '/RestErrorStub.php';

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound -- WordPress test stub.
/** Minimal request methods used by the document controller. */
class WP_REST_Request {
	/**
	 * Create a minimal REST request.
	 *
	 * @param string $method HTTP method.
	 * @param int    $post_id Post ID.
	 * @param string $body Request body.
	 * @param string $content_type Content type.
	 */
	public function __construct( private string $method, private int $post_id, private string $body = '', private string $content_type = 'application/json' ) {}

	/** Resolved REST route. */
	public function get_route(): string {
		return '/blixis/v1/documents/' . $this->post_id . '/preview';
	}

	/** Request method. */
	public function get_method(): string {
		return $this->method;
	}

	/**
	 * Route parameter.
	 *
	 * @param string $key Parameter name.
	 */
	public function get_param( string $key ): mixed {
		return 'post_id' === $key ? $this->post_id : null;
	}

	/**
	 * Header value.
	 *
	 * @param string $key Header name.
	 */
	public function get_header( string $key ): string {
		return 'content-type' === $key ? $this->content_type : '';
	}

	/** Raw request body. */
	public function get_body(): string {
		return $this->body;
	}
}
// phpcs:enable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound
