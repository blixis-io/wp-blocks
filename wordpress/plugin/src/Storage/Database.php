<?php
/**
 * Atomic postmeta operations used by the storage repositories.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** A row identity makes duplicate meta keys detectable instead of silently ambiguous. */
interface Database {
	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @return list<array{id:int,value:string}> Up to two rows.
	 */
	public function rows( int $post_id, string $key ): array;

	/**
	 * Acquire a connection-scoped lock for a single post/key, or throw on failure.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 */
	public function lock( int $post_id, string $key ): void;

	/**
	 * Release the lock acquired by lock().
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 */
	public function unlock( int $post_id, string $key ): void;

	/**
	 * Insert one row; caller holds the per-key lock.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param string $value Value.
	 */
	public function insert( int $post_id, string $key, string $value ): bool;

	/**
	 * Atomic exact-byte CAS on the one identified row.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param int    $row_id Value.
	 * @param string $old_value Value.
	 * @param string $new_value Value.
	 */
	public function compare_and_swap( int $post_id, string $key, int $row_id, string $old_value, string $new_value ): bool;

	/**
	 * Implement the storage contract.
	 *
	 * @param int $post_id Value.
	 * @return list<string> Snapshot keys.
	 */
	public function snapshot_keys( int $post_id ): array;

	/**
	 * Keys of the revision-ring history rows of one working stream.
	 *
	 * @param int    $post_id Value.
	 * @param string $stream_key Layout or content stream key.
	 * @return list<string> History keys.
	 */
	public function revision_keys( int $post_id, string $stream_key ): array;

	/**
	 * Delete only the identified snapshot row if its key is still unreferenced.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param int    $row_id Value.
	 */
	public function delete( int $post_id, string $key, int $row_id ): bool;
}
