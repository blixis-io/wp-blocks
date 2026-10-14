<?php
/**
 * WordPress postmeta SQL adapter.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Prepared SQL and MySQL advisory locks for the non-unique postmeta table. */
final class WpdbDatabase implements Database {
	/** WordPress database connection.
	 *
	 * @var \wpdb
	 */
	private \wpdb $wpdb;

	/**
	 * Accept the site-specific WordPress database connection.
	 *
	 * @param \wpdb $wpdb Value.
	 */
	public function __construct( \wpdb $wpdb ) {
		$this->wpdb = $wpdb;
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @throws \RuntimeException When storage fails.
	 * @return list<array{id:int,value:string}> Values.
	 */
	public function rows( int $post_id, string $key ): array {
		$sql = $this->wpdb->prepare( 'SELECT meta_id, meta_value FROM %i WHERE post_id = %d AND BINARY meta_key = BINARY %s ORDER BY meta_id LIMIT 2', $this->wpdb->postmeta, $post_id, $key );
		if ( ! \is_string( $sql ) ) {
			throw new \RuntimeException( 'Unable to prepare builder meta query.' );
		}
		$rows = $this->wpdb->get_results( $sql, ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Prepared immediately above.
		if ( ! \is_array( $rows ) ) {
			throw new \RuntimeException( 'Unable to read builder post meta.' );
		}
		return \array_map(
			static fn ( array $row ): array => [
				'id'    => (int) $row['meta_id'],
				'value' => (string) $row['meta_value'],
			],
			$rows
		);
	}

	/**
	 * Advisory lock names are site/table scoped, bounded to 64 ASCII characters.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 */
	private function lock_name( int $post_id, string $key ): string {
		return 'blixis:' . \substr( \hash( 'sha256', $this->wpdb->postmeta . ':' . $post_id . ':' . $key ), 0, 56 );
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @throws \RuntimeException When storage fails.
	 */
	public function lock( int $post_id, string $key ): void {
		$sql = $this->wpdb->prepare( 'SELECT GET_LOCK(%s, 5)', $this->lock_name( $post_id, $key ) );
		if ( ! \is_string( $sql ) ) {
			throw new \RuntimeException( 'Unable to prepare builder lock query.' );
		}
		$result = $this->wpdb->get_var( $sql ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Prepared immediately above.
		if ( '1' !== (string) $result ) {
			throw new \RuntimeException( 'Unable to lock builder post meta.' );
		}
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @throws \RuntimeException When query preparation fails.
	 */
	public function unlock( int $post_id, string $key ): void {
		$sql = $this->wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $this->lock_name( $post_id, $key ) );
		if ( ! \is_string( $sql ) ) {
			throw new \RuntimeException( 'Unable to prepare builder unlock query.' );
		}
		$this->wpdb->get_var( $sql ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Prepared immediately above.
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
		$sql = $this->wpdb->prepare( 'INSERT INTO %i (post_id, meta_key, meta_value) VALUES (%d, %s, %s)', $this->wpdb->postmeta, $post_id, $key, $value );
		if ( ! \is_string( $sql ) ) {
			throw new \RuntimeException( 'Unable to prepare builder meta query.' );
		}
		$inserted = 1 === $this->affected_rows( $sql );
		if ( $inserted ) {
			\wp_cache_delete( $post_id, 'post_meta' );
		}
		return $inserted;
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param int    $row_id Value.
	 * @param string $old_value Value.
	 * @param string $new_value Value.
	 * @throws \RuntimeException When storage fails.
	 */
	public function compare_and_swap( int $post_id, string $key, int $row_id, string $old_value, string $new_value ): bool {
		$sql = $this->wpdb->prepare( 'UPDATE %i SET meta_value = %s WHERE meta_id = %d AND post_id = %d AND BINARY meta_key = BINARY %s AND BINARY meta_value = BINARY %s', $this->wpdb->postmeta, $new_value, $row_id, $post_id, $key, $old_value );
		if ( ! \is_string( $sql ) ) {
			throw new \RuntimeException( 'Unable to prepare builder meta query.' );
		}
		$updated = 1 === $this->affected_rows( $sql );
		if ( $updated ) {
			\wp_cache_delete( $post_id, 'post_meta' );
		}
		return $updated;
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int $post_id Value.
	 * @throws \RuntimeException When storage fails.
	 * @return list<string> Values.
	 */
	public function snapshot_keys( int $post_id ): array {
		$sql = $this->wpdb->prepare( 'SELECT meta_key FROM %i WHERE post_id = %d AND meta_key LIKE %s', $this->wpdb->postmeta, $post_id, $this->wpdb->esc_like( '_blixis_snap_' ) . '%' );
		if ( ! \is_string( $sql ) ) {
			throw new \RuntimeException( 'Unable to prepare builder meta query.' );
		}
		$keys = $this->wpdb->get_col( $sql ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Prepared immediately above.
		if ( ! \is_array( $keys ) ) {
			throw new \RuntimeException( 'Unable to list builder snapshots.' );
		}
		return \array_values( \array_filter( $keys, static fn ( mixed $key ): bool => \is_string( $key ) && MetaKeys::is_snapshot( $key ) ) );
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param int    $row_id Value.
	 * @throws \RuntimeException When storage fails.
	 */
	public function delete( int $post_id, string $key, int $row_id ): bool {
		$sql = $this->wpdb->prepare( 'DELETE FROM %i WHERE meta_id = %d AND post_id = %d AND BINARY meta_key = BINARY %s', $this->wpdb->postmeta, $row_id, $post_id, $key );
		if ( ! \is_string( $sql ) ) {
			throw new \RuntimeException( 'Unable to prepare builder meta query.' );
		}
		$deleted = 1 === $this->affected_rows( $sql );
		if ( $deleted ) {
			\wp_cache_delete( $post_id, 'post_meta' );
		}
		return $deleted;
	}

	/**
	 * Run an already-prepared mutation, separating SQL errors from CAS misses.
	 *
	 * @param string $sql Prepared SQL.
	 * @return int Number of affected rows.
	 * @throws \RuntimeException When the database rejects the query.
	 */
	private function affected_rows( string $sql ): int {
		$count = $this->wpdb->query( $sql ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Prepared by each caller.
		if ( ! \is_int( $count ) ) {
			throw new \RuntimeException( 'Builder postmeta query failed.' );
		}
		return $count;
	}
}
