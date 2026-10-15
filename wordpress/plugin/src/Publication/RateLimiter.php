<?php
/**
 * Per-actor publication rate policy.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;

/** Stores successful publication times for one user and post. */
interface RateLimiter {
	/**
	 * Seconds until a new publication is allowed, or zero when allowed.
	 *
	 * @param int $actor WordPress user ID.
	 * @param int $post_id Post ID.
	 */
	public function retry_after( int $actor, int $post_id ): int;

	/**
	 * Record a successful publication.
	 *
	 * @param int $actor WordPress user ID.
	 * @param int $post_id Post ID.
	 */
	public function record( int $actor, int $post_id ): void;
}
