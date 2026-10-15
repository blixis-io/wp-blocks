<?php
/**
 * Timestamp storage boundary.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;
/** Persists the rolling window per actor and post. */
interface RateStore {
	/** Read recorded timestamps.
	 *
	 * @param int $actor User ID.
	 * @param int $post_id Post ID.
	 * @return list<int>
	 */
	public function read( int $actor, int $post_id ): array;
	/** Write recorded timestamps.
	 *
	 * @param int   $actor User ID.
	 * @param int   $post_id Post ID.
	 * @param array $times Timestamps.
	 * @phpstan-param list<int> $times
	 */
	public function write( int $actor, int $post_id, array $times ): void;
}
