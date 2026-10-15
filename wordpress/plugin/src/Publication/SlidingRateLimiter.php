<?php
/**
 * Pure rolling publication limit.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;
/** At most 30 successful publications in the preceding hour. */
final class SlidingRateLimiter implements RateLimiter {
	/** Construct with a clock and store.
	 *
	 * @param RateStore $store Timestamp store.
	 * @param \Closure  $clock Returns Unix seconds.
	 * @phpstan-param \Closure(): int $clock
	 */
	public function __construct( private RateStore $store, private \Closure $clock ) {}
	/** Seconds until the next publication is allowed.
	 *
	 * @param int $actor User ID.
	 * @param int $post_id Post ID.
	 */
	public function retry_after( int $actor, int $post_id ): int {
		$times = $this->times( $actor, $post_id );
		return \count( $times ) >= 30 ? \max( 1, $times[0] + 3600 - ( $this->clock )() ) : 0;
	}
	/** Record a successful publication.
	 *
	 * @param int $actor User ID.
	 * @param int $post_id Post ID.
	 */
	public function record( int $actor, int $post_id ): void {
		$times   = $this->times( $actor, $post_id );
		$times[] = ( $this->clock )();
		$this->store->write( $actor, $post_id, $times );
	}
	/** Keep only timestamps inside the rolling hour.
	 *
	 * @param int $actor User ID.
	 * @param int $post_id Post ID.
	 * @return list<int>
	 */
	private function times( int $actor, int $post_id ): array {
		$now   = ( $this->clock )();
		$times = \array_values( \array_filter( $this->store->read( $actor, $post_id ), static fn ( mixed $time ): bool => \is_int( $time ) && $time > $now - 3600 && $time <= $now ) );
		\sort( $times, SORT_NUMERIC );
		return $times;
	}
}
