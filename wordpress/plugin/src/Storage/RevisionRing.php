<?php
/**
 * Bounded history of working-stream values (save recovery and restore).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/**
 * Every successful write of a working stream keeps the value it replaced as an immutable history row (ADR 0004 section 5):
 * the last 20 per stream, oldest pruned first. Restoring is a normal write of an old value, so history stays append-only and
 * the restore itself is undoable. Core WordPress revisions are deliberately not used (spike BWB-040).
 */
final class RevisionRing {
	public const LIMIT       = 20;
	private const MAX_BYTES  = 3145728;
	private const WRAPPER_V1 = 1;

	/**
	 * Create the ring.
	 *
	 * @param Database        $database Storage.
	 * @param RevisionContext $context Actor and clock.
	 */
	public function __construct( private readonly Database $database, private readonly RevisionContext $context ) {}

	/**
	 * Keep the value a successful write replaced.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $stream_key Working stream key.
	 * @param string $previous_value Stored value before the write.
	 * @return void
	 */
	public function record( int $post_id, string $stream_key, string $previous_value ): void {
		$revision = Envelope::revision( $previous_value, $stream_key );
		if ( null === $revision || MetaKeys::PUBLISHED === $stream_key ) {
			return;
		}
		$key = MetaKeys::rev( $stream_key, $revision );
		if ( [] !== $this->database->rows( $post_id, $key ) ) {
			return;
		}
		$wrapper = \json_encode( // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure helper used without WordPress.
			[
				'v'        => self::WRAPPER_V1,
				'revision' => $revision,
				'savedAt'  => $this->context->now(),
				'author'   => $this->context->user_id(),
				'stream'   => $previous_value,
			]
		);
		if ( false === $wrapper || \strlen( $wrapper ) > self::MAX_BYTES ) {
			return;
		}
		$this->database->insert( $post_id, $key, $wrapper );
		$this->prune( $post_id, $stream_key );
	}

	/**
	 * History of a stream, newest first.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $stream_key Working stream key.
	 * @return list<array{revision: int, savedAt: string, author: int}>
	 */
	public function list( int $post_id, string $stream_key ): array {
		$out = [];
		foreach ( $this->numbers( $post_id, $stream_key ) as $revision => $key ) {
			$row = $this->read( $post_id, $key );
			if ( null !== $row ) {
				$out[] = [
					'revision' => $revision,
					'savedAt'  => $row['savedAt'],
					'author'   => $row['author'],
				];
			}
		}
		return $out;
	}

	/**
	 * The stream value a revision had, or null when it is gone.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $stream_key Working stream key.
	 * @param int    $revision Revision number.
	 * @return ?string
	 */
	public function fetch( int $post_id, string $stream_key, int $revision ): ?string {
		if ( $revision < 1 ) {
			return null;
		}
		$row = $this->read( $post_id, MetaKeys::rev( $stream_key, $revision ) );
		return null === $row ? null : $row['stream'];
	}

	/**
	 * Revision number to key, newest first.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $stream_key Working stream key.
	 * @return array<int, string>
	 */
	private function numbers( int $post_id, string $stream_key ): array {
		$numbers = [];
		foreach ( $this->database->revision_keys( $post_id, $stream_key ) as $key ) {
			$position = \strrpos( $key, '_' );
			if ( false !== $position ) {
				$numbers[ (int) \substr( $key, $position + 1 ) ] = $key;
			}
		}
		\krsort( $numbers, SORT_NUMERIC );
		return $numbers;
	}

	/**
	 * Delete history beyond the limit, oldest first.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $stream_key Working stream key.
	 * @return void
	 */
	private function prune( int $post_id, string $stream_key ): void {
		foreach ( \array_slice( $this->numbers( $post_id, $stream_key ), self::LIMIT, null, true ) as $key ) {
			$rows = $this->database->rows( $post_id, $key );
			if ( 1 === \count( $rows ) ) {
				$this->database->delete( $post_id, $key, $rows[0]['id'] );
			}
		}
	}

	/**
	 * Read and validate one history row.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key History key.
	 * @return ?array{savedAt: string, author: int, stream: string}
	 */
	private function read( int $post_id, string $key ): ?array {
		$rows = $this->database->rows( $post_id, $key );
		if ( 1 !== \count( $rows ) ) {
			return null;
		}
		$data = \json_decode( $rows[0]['value'], true, 8 );
		if ( ! \is_array( $data ) || self::WRAPPER_V1 !== ( $data['v'] ?? null ) || ! \is_string( $data['savedAt'] ?? null ) || ! \is_int( $data['author'] ?? null ) || ! \is_string( $data['stream'] ?? null ) ) {
			return null;
		}
		return [
			'savedAt' => $data['savedAt'],
			'author'  => $data['author'],
			'stream'  => $data['stream'],
		];
	}
}
