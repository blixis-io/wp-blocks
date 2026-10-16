<?php
/**
 * Per-site publication timestamps.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;
/** Stores timestamps under a bounded transient key. */
final class WordPressTransientRateStore implements RateStore {
	/**
	 * Create the store.
	 *
	 * @param string $prefix Transient key prefix (one bucket family per feature).
	 */
	public function __construct( private readonly string $prefix = 'blixis_pub_' ) {}

	/** Read the transient.
	 *
	 * @param int $actor User ID.
	 * @param int $post_id Post ID.
	 * @return list<int>
	 */
	public function read( int $actor, int $post_id ): array {
		$value = \get_transient( $this->key( $actor, $post_id ) );
		return \is_array( $value ) ? \array_values( \array_filter( $value, 'is_int' ) ) : [];
	}
	/** Store the window for one hour.
	 *
	 * @param int   $actor User ID.
	 * @param int   $post_id Post ID.
	 * @param array $times Timestamps.
	 * @phpstan-param list<int> $times
	 */
	public function write( int $actor, int $post_id, array $times ): void {
		\set_transient( $this->key( $actor, $post_id ), $times, 3600 );
	}
	/** Build a bounded per-user/per-post key.
	 *
	 * @param int $actor User ID.
	 * @param int $post_id Post ID.
	 */
	private function key( int $actor, int $post_id ): string {
		return $this->prefix . $actor . '_' . $post_id;
	}
}
