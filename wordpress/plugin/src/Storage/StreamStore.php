<?php
/**
 * Per-stream compare-and-swap repository.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Owns working streams and the publication pointer; snapshots use SnapshotStore. */
final class StreamStore {
	/** Document validation policy.
	 *
	 * @var DocumentValidator
	 */
	private DocumentValidator $validator;

	/**
	 * Inject a pure-testable database and optionally a later full document validator.
	 *
	 * @param Database           $database Value.
	 * @param ?DocumentValidator $validator Value.
	 * @param ?RevisionRing      $ring Revision history of working streams, if kept.
	 */
	public function __construct( private Database $database, ?DocumentValidator $validator = null, private ?RevisionRing $ring = null ) {
		$this->validator = $validator ?? new EnvelopeValidator();
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @return array{revision:int,value:string}|null Existing stream.
	 * @throws \RuntimeException When storage fails.
	 */
	public function read( int $post_id, string $key ): ?array {
		$this->assert_stream( $post_id, $key );
		$rows = $this->database->rows( $post_id, $key );
		if ( [] === $rows ) {
			return null;
		}
		if ( 1 !== \count( $rows ) ) {
			throw new \RuntimeException( 'Duplicate builder stream rows.' );
		}
		$revision = Envelope::revision( $rows[0]['value'], $key );
		if ( null === $revision ) {
			throw new \RuntimeException( 'Invalid stored builder stream.' );
		}
		return [
			'revision' => $revision,
			'value'    => $rows[0]['value'],
		];
	}

	/**
	 * Atomically advance exactly one stream; missing rows start at expected revision zero.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param string $value Value.
	 * @param int    $expected_revision Value.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	public function write( int $post_id, string $key, string $value, int $expected_revision ): WriteResult {
		$this->assert_stream( $post_id, $key );
		if ( $expected_revision < 0 || ! $this->validator->accepts( $value, $key ) || null === Envelope::revision( $value, $key ) ) {
			throw new \InvalidArgumentException( 'Invalid builder stream envelope or expected revision.' );
		}
		$new_value = Envelope::with_revision( $value, $key, $expected_revision + 1 );
		if ( null === $new_value ) {
			throw new \InvalidArgumentException( 'Builder stream exceeds envelope limits.' );
		}
		if ( MetaKeys::PUBLISHED === $key ) {
			$this->database->lock( $post_id, $key );
			try {
				return $this->write_locked_pointer( $post_id, $key, $new_value, $expected_revision );
			} finally {
				$this->database->unlock( $post_id, $key );
			}
		}
		return $this->write_locked_pointer( $post_id, $key, $new_value, $expected_revision );
	}

	/**
	 * The caller holds the pointer lock when writing the publication row.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @param string $new_value Value.
	 * @param int    $expected_revision Value.
	 * @throws \RuntimeException When storage fails.
	 */
	private function write_locked_pointer( int $post_id, string $key, string $new_value, int $expected_revision ): WriteResult {
		if ( 0 === $expected_revision ) {
			if ( MetaKeys::PUBLISHED !== $key ) {
				$this->database->lock( $post_id, $key );
			}
			try {
				if ( [] === $this->database->rows( $post_id, $key ) && $this->database->insert( $post_id, $key, $new_value ) ) {
					return WriteResult::success( 1, 0 );
				}
			} finally {
				if ( MetaKeys::PUBLISHED !== $key ) {
					$this->database->unlock( $post_id, $key );
				}
			}
			return WriteResult::conflict( $this->read( $post_id, $key )['revision'] ?? 0, 0 );
		}
		$rows = $this->database->rows( $post_id, $key );
		if ( \count( $rows ) > 1 ) {
			throw new \RuntimeException( 'Duplicate builder stream rows.' );
		}
		if ( [] === $rows ) {
			return WriteResult::conflict( 0, $expected_revision );
		}
		$current = Envelope::revision( $rows[0]['value'], $key );
		if ( null === $current ) {
			throw new \RuntimeException( 'Invalid stored builder stream.' );
		}
		if ( $expected_revision === $current && $this->database->compare_and_swap( $post_id, $key, $rows[0]['id'], $rows[0]['value'], $new_value ) ) {
			$this->keep_history( $post_id, $key, $rows[0]['value'] );
			return WriteResult::success( $current + 1, $expected_revision );
		}
		return WriteResult::conflict( $this->read( $post_id, $key )['revision'] ?? 0, $expected_revision );
	}

	/**
	 * Keep the replaced value of a working stream in the revision ring; history problems never fail the write.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key Stream key.
	 * @param string $previous Value before the write.
	 * @return void
	 */
	private function keep_history( int $post_id, string $key, string $previous ): void {
		if ( null === $this->ring || MetaKeys::PUBLISHED === $key ) {
			return;
		}
		try {
			$this->ring->record( $post_id, $key, $previous );
		} catch ( \Throwable $error ) {
			unset( $error ); // The write already succeeded; losing one history row is acceptable.
		}
	}

	/**
	 * Reject snapshot or arbitrary meta keys at this boundary.
	 *
	 * @param int    $post_id Value.
	 * @param string $key Value.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	private function assert_stream( int $post_id, string $key ): void {
		if ( $post_id < 1 || ! MetaKeys::is_valid_key( $key ) || MetaKeys::is_snapshot( $key ) ) {
			throw new \InvalidArgumentException( 'Invalid builder stream address.' );
		}
	}
}
