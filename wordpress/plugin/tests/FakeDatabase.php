<?php
/**
 * Pure storage contract tests for BWB-040.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

/** In-memory postmeta with the same row and lock semantics as the SQL adapter. */
final class FakeDatabase implements Database {
	/** Postmeta rows by post and key.
	 *
	 * @var array<int, array<string, array<int, array{id:int,value:string}>>>
	 */
	public array $data = [];
	/** Held advisory locks.
	 *
	 * @var array<string, true>
	 */
	private array $locks = [];
	/** Next fake row ID.
	 *
	 * @var int
	 */
	private int $next_id = 1;
	/** Inject a crash at the pointer insert.
	 *
	 * @var bool
	 */
	public bool $fail_pointer_insert = false;
	/** Keys read by the repository.
	 *
	 * @var list<string>
	 */
	public array $read_keys = [];
	/** Exact post/key addresses read by the repository.
	 *
	 * @var list<array{int,string}>
	 */
	public array $read_addresses = [];

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @return list<array{id:int,value:string}> Values.
	 */
	public function rows( int $post_id, string $key ): array {
		$this->read_keys[]      = $key;
		$this->read_addresses[] = [ $post_id, $key ];
		return \array_slice( $this->data[ $post_id ][ $key ] ?? [], 0, 2 );
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @throws \RuntimeException When storage fails.
	 */
	public function lock( int $post_id, string $key ): void {
		$name = $post_id . ':' . $key;
		if ( isset( $this->locks[ $name ] ) ) {
			throw new \RuntimeException( 'Lock already held.' );
		}
		$this->locks[ $name ] = true;
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 */
	public function unlock( int $post_id, string $key ): void {
		unset( $this->locks[ $post_id . ':' . $key ] );
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param string $value Value.
	 * @throws \RuntimeException When storage fails.
	 */
	public function insert( int $post_id, string $key, string $value ): bool {
		if ( $this->fail_pointer_insert && MetaKeys::PUBLISHED === $key ) {
			throw new \RuntimeException( 'Injected interruption.' );
		}
		$this->data[ $post_id ][ $key ][] = [
			'id'    => $this->next_id++,
			'value' => $value,
		];
		return true;
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param int    $row_id Value.
	 * @param string $old_value Value.
	 * @param string $new_value Value.
	 */
	public function compare_and_swap( int $post_id, string $key, int $row_id, string $old_value, string $new_value ): bool {
		foreach ( $this->data[ $post_id ][ $key ] as &$row ) {
			if ( $row_id === $row['id'] && $old_value === $row['value'] ) {
				$row['value'] = $new_value;
				return true;
			}
		}
		return false;
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int $post_id Value.
	 * @return list<string> Values.
	 */
	public function snapshot_keys( int $post_id ): array {
		return \array_values( \array_filter( \array_keys( $this->data[ $post_id ] ?? [] ), [ MetaKeys::class, 'is_snapshot' ] ) );
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $stream_key Value.
	 * @return list<string> Values.
	 */
	public function revision_keys( int $post_id, string $stream_key ): array {
		$prefix = MetaKeys::rev_prefix( $stream_key );
		return \array_values( \array_filter( \array_keys( $this->data[ $post_id ] ?? [] ), static fn ( $key ): bool => \is_string( $key ) && MetaKeys::is_revision( $key ) && 0 === \strpos( $key, $prefix ) ) );
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param int    $row_id Value.
	 */
	public function delete( int $post_id, string $key, int $row_id ): bool {
		foreach ( $this->data[ $post_id ][ $key ] ?? [] as $index => $row ) {
			if ( $row_id === $row['id'] ) {
				unset( $this->data[ $post_id ][ $key ][ $index ] );
				if ( [] === $this->data[ $post_id ][ $key ] ) {
					unset( $this->data[ $post_id ][ $key ] );
				}
				return true;
			}
		}
		return false;
	}
}
