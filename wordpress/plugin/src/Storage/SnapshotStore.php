<?php
/**
 * Immutable publication snapshots and orphan cleanup.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Writes snapshots before advancing the live pointer. */
final class SnapshotStore {
	/** Document validation policy.
	 *
	 * @var DocumentValidator
	 */
	private DocumentValidator $validator;

	/**
	 * Accept the same database connection as StreamStore.
	 *
	 * @param Database           $database Value.
	 * @param StreamStore        $streams Value.
	 * @param ?DocumentValidator $validator Value.
	 */
	public function __construct( private Database $database, private StreamStore $streams, ?DocumentValidator $validator = null ) {
		$this->validator = $validator ?? new EnvelopeValidator();
	}

	/**
	 * Insert an immutable snapshot, then CAS the publication pointer.
	 *
	 * @param int    $post_id Value.
	 * @param string $snapshot_key Value.
	 * @param string $snapshot_value Value.
	 * @param int    $pointer_expected_revision Value.
	 * @param string $new_pointer_value Value.
	 * @throws \InvalidArgumentException When input is invalid.
	 * @throws \RuntimeException When storage fails.
	 */
	public function publish( int $post_id, string $snapshot_key, string $snapshot_value, int $pointer_expected_revision, string $new_pointer_value ): WriteResult {
		if ( $post_id < 1 || ! MetaKeys::is_snapshot( $snapshot_key ) || ! $this->validator->accepts( $snapshot_value, $snapshot_key ) ) {
			throw new \InvalidArgumentException( 'Invalid snapshot.' );
		}
		$revision = Envelope::revision( $snapshot_value, $snapshot_key );
		if ( null === $revision || ! \str_ends_with( $snapshot_key, '_' . $revision ) ) {
			throw new \InvalidArgumentException( 'Snapshot key and revision differ.' );
		}
		if ( ! $this->validator->accepts( $new_pointer_value, MetaKeys::PUBLISHED ) ) {
			throw new \InvalidArgumentException( 'Invalid publication pointer.' );
		}
		if ( ! isset( $this->referenced_keys( $new_pointer_value )[ $snapshot_key ] ) ) {
			throw new \InvalidArgumentException( 'Publication pointer must reference the new snapshot.' );
		}
		$this->database->lock( $post_id, $snapshot_key );
		try {
			if ( [] !== $this->database->rows( $post_id, $snapshot_key ) ) {
				throw new \RuntimeException( 'Snapshot already exists.' );
			}
			if ( ! $this->database->insert( $post_id, $snapshot_key, $snapshot_value ) ) {
				throw new \RuntimeException( 'Snapshot insert failed.' );
			}
		} finally {
			$this->database->unlock( $post_id, $snapshot_key );
		}
		return $this->streams->write( $post_id, MetaKeys::PUBLISHED, $new_pointer_value, $pointer_expected_revision );
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param int    $post_id Value.
	 * @param string $pointer Value.
	 * @return list<string> Unreferenced snapshot keys.
	 */
	public function unreferenced( int $post_id, string $pointer ): array {
		$referenced = $this->referenced_keys( $pointer );
		$orphans    = [];
		foreach ( $this->database->snapshot_keys( $post_id ) as $key ) {
			if ( ! isset( $referenced[ $key ] ) ) {
				$orphans[] = $key;
			}
		}
		return \array_values( \array_unique( $orphans ) );
	}

	/**
	 * Remove only snapshots absent from the current pointer. Run after the
	 * BWB-046 revision-retention policy has contributed its protected keys.
	 *
	 * @param int    $post_id Value.
	 * @param string $pointer Value.
	 * @throws \RuntimeException When storage fails.
	 * @return list<string> Deleted snapshot keys.
	 */
	public function collect( int $post_id, string $pointer ): array {
		$this->database->lock( $post_id, MetaKeys::PUBLISHED );
		try {
			$current = $this->streams->read( $post_id, MetaKeys::PUBLISHED );
			if ( ( null === $current && '' !== $pointer ) || ( null !== $current && $current['value'] !== $pointer ) ) {
				throw new \RuntimeException( 'Publication pointer changed.' );
			}
			$deleted = [];
			$orphans = '' === $pointer ? $this->database->snapshot_keys( $post_id ) : $this->unreferenced( $post_id, $pointer );
			foreach ( $orphans as $key ) {
				$this->database->lock( $post_id, $key );
				try {
					$rows = $this->database->rows( $post_id, $key );
					if ( 1 === \count( $rows ) && $this->database->delete( $post_id, $key, $rows[0]['id'] ) ) {
						$deleted[] = $key;
					}
				} finally {
					$this->database->unlock( $post_id, $key );
				}
			}
			return $deleted;
		} finally {
			$this->database->unlock( $post_id, MetaKeys::PUBLISHED );
		}
	}

	/**
	 * Implement the storage contract.
	 *
	 * @param string $pointer Value.
	 * @return array<string, true> Directly referenced snapshot keys.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	private function referenced_keys( string $pointer ): array {
		$data = Envelope::decode( $pointer, MetaKeys::PUBLISHED );
		if ( null === $data ) {
			throw new \InvalidArgumentException( 'Invalid publication pointer.' );
		}
		$keys = [];
		if ( isset( $data->{'publishedLayoutRevision'} ) && ( ! \is_int( $data->{'publishedLayoutRevision'} ) || $data->{'publishedLayoutRevision'} < 1 ) ) {
			throw new \InvalidArgumentException( 'Invalid published layout revision.' );
		}
		if ( isset( $data->{'publishedLayoutRevision'} ) ) {
			$keys[ MetaKeys::snap_layout( $data->{'publishedLayoutRevision'} ) ] = true;
		}
		if ( isset( $data->locales ) && ! $data->locales instanceof \stdClass ) {
			throw new \InvalidArgumentException( 'Invalid locale pointers.' );
		}
		if ( isset( $data->locales ) && $data->locales instanceof \stdClass ) {
			foreach ( \get_object_vars( $data->locales ) as $locale => $entry ) {
				if ( ! MetaKeys::is_valid_locale( $locale ) || ! $entry instanceof \stdClass ) {
					throw new \InvalidArgumentException( 'Invalid locale pointer.' );
				}
				foreach ( [ 'contentSnapshot', 'baseLayout', 'sourceContentRevision' ] as $field ) {
					if ( isset( $entry->$field ) && ( ! \is_int( $entry->$field ) || $entry->$field < 1 ) ) {
						throw new \InvalidArgumentException( 'Invalid snapshot reference.' );
					}
				}
				if ( isset( $entry->{'contentSnapshot'} ) ) {
					$keys[ MetaKeys::snap_content( $locale, $entry->{'contentSnapshot'} ) ] = true;
				}
				if ( isset( $entry->{'baseLayout'} ) ) {
					$keys[ MetaKeys::snap_layout( $entry->{'baseLayout'} ) ] = true;
				}
				if ( isset( $entry->{'sourceContentRevision'} ) && ( ! isset( $data->{'defaultLocale'} ) || ! \is_string( $data->{'defaultLocale'} ) || ! MetaKeys::is_valid_locale( $data->{'defaultLocale'} ) ) ) {
					throw new \InvalidArgumentException( 'Missing default locale for source snapshot.' );
				}
				if ( isset( $entry->{'sourceContentRevision'} ) ) {
					$keys[ MetaKeys::snap_content( $data->{'defaultLocale'}, $entry->{'sourceContentRevision'} ) ] = true;
				}
			}
		}
		return $keys;
	}
}
