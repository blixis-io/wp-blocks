<?php
/**
 * Transient-backed publication rate limit.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;

/** WordPress-backed rolling one-hour window. */
final class WordPressRateLimiter implements RateLimiter {
	/** Pure policy.
	 *
	 * @var SlidingRateLimiter
	 */
	private SlidingRateLimiter $limiter;

	/** Create the transient-backed policy.
	 *
	 * @param string $prefix Transient key prefix (one bucket family per feature).
	 */
	public function __construct( string $prefix = 'blixis_pub_' ) {
		$this->limiter = new SlidingRateLimiter( new WordPressTransientRateStore( $prefix ), static fn (): int => \time() );
	}

	/** Check the current window.
	 *
	 * @param int $actor User ID.
	 * @param int $post_id Post ID.
	 */
	public function retry_after( int $actor, int $post_id ): int {
		return $this->limiter->retry_after( $actor, $post_id );
	}

	/** Record one successful write.
	 *
	 * @param int $actor User ID.
	 * @param int $post_id Post ID.
	 */
	public function record( int $actor, int $post_id ): void {
		$this->limiter->record( $actor, $post_id );
	}
}
