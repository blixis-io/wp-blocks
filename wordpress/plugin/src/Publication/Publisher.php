<?php
/**
 * Publishing and rolling back published snapshots (ADR 0004).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

use Blixis\Builder\Preview\PreviewDocument;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Storage\Database;
use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\SnapshotStore;
use Blixis\Builder\Storage\StreamStore;

\defined( 'ABSPATH' ) || exit;

/**
 * Layout and locale content are published separately but move the single publication pointer in one compare-and-swap:
 * snapshots are written first (immutable), then the pointer is advanced once, so a failure leaves the live page unchanged.
 * Rollback republishes an old snapshot under a new number (append-only); a locale rollback restores the pair
 * (base layout, content snapshot) exactly as it was.
 */
final class Publisher {
	private const PUBLISH_SNAPSHOT_LIMIT = 200;
	// Rollback is recovery and must remain possible after the publish cap is reached.
	private const ROLLBACK_SNAPSHOT_LIMIT = 240;
	/**
	 * Create a publisher.
	 *
	 * @param Database        $database Storage.
	 * @param StreamStore     $streams Working streams and the pointer.
	 * @param SnapshotStore   $snapshots Snapshot writer.
	 * @param ElementRegistry $registry Element registry (translatable properties).
	 */
	public function __construct( private readonly Database $database, private readonly StreamStore $streams, private readonly SnapshotStore $snapshots, private readonly ElementRegistry $registry ) {}

	/**
	 * Publish working data, or republish an old snapshot when the options name one.
	 *
	 * @param int            $post_id Post ID.
	 * @param PublishOptions $options What to do.
	 * @return PublishResult
	 */
	public function publish( int $post_id, PublishOptions $options ): PublishResult {
		try {
			return $this->run( $post_id, $options );
		} catch ( \InvalidArgumentException $error ) {
			return PublishResult::error( 422, 'blixis_invalid_document' );
		} catch ( \RuntimeException $error ) {
			return PublishResult::error( 500, 'blixis_storage_error' );
		}
	}

	/**
	 * Publication state of the layout and of every published locale.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string, mixed>
	 */
	public function status( int $post_id ): array {
		$stored  = $this->streams->read( $post_id, MetaKeys::PUBLISHED );
		$pointer = null === $stored ? null : Envelope::decode( $stored['value'], MetaKeys::PUBLISHED );
		$out     = [
			'pointerRevision' => $stored['revision'] ?? 0,
			'layout'          => $this->state( $post_id, MetaKeys::LAYOUT, $this->layout_number( $pointer ), MetaKeys::snap_layout( \max( 1, $this->layout_number( $pointer ) ) ) ),
			'locales'         => [],
		];
		$locales = null !== $pointer && ( $pointer->locales ?? null ) instanceof \stdClass ? \get_object_vars( $pointer->locales ) : [];
		foreach ( $locales as $locale => $entry ) {
			$locale   = (string) $locale;
			$snapshot = $entry instanceof \stdClass && \is_int( $entry->{'contentSnapshot'} ?? null ) ? $entry->{'contentSnapshot'} : 0;
			if ( MetaKeys::is_valid_locale( $locale ) ) {
				$out['locales'][ $locale ] = $this->state( $post_id, MetaKeys::content( $locale ), $snapshot, 0 < $snapshot ? MetaKeys::snap_content( $locale, $snapshot ) : '' );
			}
		}
		return $out;
	}

	/**
	 * Unpublished, published or published-with-pending-changes for one stream.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $working_key Working stream key.
	 * @param int    $snapshot_number Published snapshot number, 0 when none.
	 * @param string $snapshot_key Published snapshot key.
	 * @return array{state: string, snapshot: int, workingRevision: int}
	 */
	private function state( int $post_id, string $working_key, int $snapshot_number, string $snapshot_key ): array {
		$working = $this->streams->read( $post_id, $working_key );
		if ( $snapshot_number < 1 || '' === $snapshot_key ) {
			return [
				'state'           => 'unpublished',
				'snapshot'        => 0,
				'workingRevision' => $working['revision'] ?? 0,
			];
		}
		$row    = $this->raw( $post_id, $snapshot_key );
		$source = null === $row ? 0 : (int) ( $row->{'sourceRevision'} ?? 0 );
		return [
			'state'           => null !== $working && $working['revision'] !== $source ? 'published-with-pending-changes' : 'published',
			'snapshot'        => $snapshot_number,
			'workingRevision' => $working['revision'] ?? 0,
		];
	}

	/**
	 * The publish algorithm.
	 *
	 * @param int            $post_id Post ID.
	 * @param PublishOptions $o Options.
	 * @return PublishResult
	 */
	private function run( int $post_id, PublishOptions $o ): PublishResult {
		$locale           = $o->locale;
		$layout_part      = $o->layout || null !== $o->layout_snapshot;
		$rollback_content = null !== $o->content_snapshot;
		if ( null !== $locale && ! MetaKeys::is_valid_locale( $locale ) ) {
			return PublishResult::error( 400, 'blixis_invalid_locale' );
		}
		if ( ( ! $layout_part && null === $locale ) || ( $rollback_content && ( null === $locale || $layout_part ) ) ) {
			return PublishResult::error( 422, 'blixis_nothing_to_publish' );
		}
		$stored  = $this->streams->read( $post_id, MetaKeys::PUBLISHED );
		$current = $stored['revision'] ?? 0;
		if ( $current !== $o->expected_pointer_revision ) {
			return PublishResult::error(
				409,
				'blixis_conflict',
				[
					'currentRevision'  => $current,
					'expectedRevision' => $o->expected_pointer_revision,
				]
			);
		}
		$needed   = (int) $layout_part + (int) ( null !== $locale );
		$rollback = null !== $o->layout_snapshot || $rollback_content;
		$limit    = $rollback ? self::ROLLBACK_SNAPSHOT_LIMIT : self::PUBLISH_SNAPSHOT_LIMIT;
		if ( \count( $this->database->snapshot_keys( $post_id ) ) + $needed > $limit ) {
			return PublishResult::error( 409, 'blixis_snapshot_limit' );
		}
		$pointer = null === $stored ? new \stdClass() : Envelope::decode( $stored['value'], MetaKeys::PUBLISHED );
		if ( null === $pointer ) {
			return PublishResult::error( 500, 'blixis_storage_error' );
		}
		$published_layout = $this->layout_number( $pointer );
		$locales          = ( $pointer->locales ?? null ) instanceof \stdClass ? \unserialize( \serialize( $pointer->locales ) ) : new \stdClass(); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize,WordPress.PHP.DiscouragedPHPFunctions.serialize_unserialize -- Deep copy of an object tree we just decoded from JSON.
		$default_locale   = \is_string( $pointer->{'defaultLocale'} ?? null ) && MetaKeys::is_valid_locale( $pointer->{'defaultLocale'} ) ? $pointer->{'defaultLocale'} : $o->default_locale;

		// Layout part.
		$layout_doc    = null;
		$layout_key    = null;
		$layout_value  = null;
		$layout_number = 0;
		if ( $layout_part ) {
			if ( null !== $o->layout_snapshot ) {
				$layout_doc = $this->raw( $post_id, MetaKeys::snap_layout( $o->layout_snapshot ) );
				$source     = (int) ( $layout_doc->{'sourceRevision'} ?? 0 );
			} else {
				$working    = $this->streams->read( $post_id, MetaKeys::LAYOUT );
				$layout_doc = null === $working ? null : Envelope::decode( $working['value'], MetaKeys::LAYOUT );
				$source     = $working['revision'] ?? 0;
			}
			if ( null === $layout_doc ) {
				return PublishResult::error( null !== $o->layout_snapshot ? 404 : 422, null !== $o->layout_snapshot ? 'blixis_snapshot_not_found' : 'blixis_nothing_to_publish' );
			}
			if ( ! PreviewDocument::accepts( $layout_doc ) ) {
				return PublishResult::error( 422, 'blixis_invalid_document' );
			}
			$layout_number = $this->next( $post_id, '_blixis_snap_layout_' );
			$layout_key    = MetaKeys::snap_layout( $layout_number );
			$layout_value  = $this->annotate(
				$layout_doc,
				$layout_key,
				$layout_number,
				[ 'sourceRevision' => $source ]
			);
		}
		$new_types = null === $layout_doc ? [] : LayoutIndex::types( $layout_doc );

		// Locale part.
		$content_key    = null;
		$content_value  = null;
		$content_base   = 0;
		$content_number = 0;
		if ( null !== $locale ) {
			if ( $rollback_content ) {
				$content_doc = $this->raw( $post_id, MetaKeys::snap_content( $locale, (int) $o->content_snapshot ) );
				if ( null === $content_doc ) {
					return PublishResult::error( 404, 'blixis_snapshot_not_found' );
				}
				$content_base = (int) ( $content_doc->{'baseLayout'} ?? 0 );
				if ( $content_base < 1 || null === $this->raw( $post_id, MetaKeys::snap_layout( $content_base ) ) ) {
					return PublishResult::error( 409, 'blixis_snapshot_missing' );
				}
				$source = (int) ( $content_doc->{'sourceRevision'} ?? 0 );
				$types  = \is_object( $content_doc->{'elementTypes'} ?? null ) ? \array_map( 'strval', \get_object_vars( $content_doc->{'elementTypes'} ) ) : [];
			} else {
				$working     = $this->streams->read( $post_id, MetaKeys::content( $locale ) );
				$content_doc = null === $working ? null : Envelope::decode( $working['value'], MetaKeys::content( $locale ) );
				if ( null === $content_doc ) {
					return PublishResult::error( 422, 'blixis_nothing_to_publish' );
				}
				$source       = $working['revision'] ?? 0;
				$content_base = $layout_part ? $layout_number : $published_layout;
				if ( $content_base < 1 ) {
					return PublishResult::error( 409, 'blixis_layout_not_published' );
				}
				$base_doc = $layout_part ? $layout_doc : $this->raw( $post_id, MetaKeys::snap_layout( $content_base ) );
				if ( null === $base_doc ) {
					return PublishResult::error( 500, 'blixis_storage_error' );
				}
				$base_types = $layout_part ? $new_types : LayoutIndex::types( $base_doc );
				$entries    = $this->entries( $content_doc );
				$problems   = Compatibility::problems( $entries, [], $base_types, $this->registry );
				if ( [] !== $problems && ! $o->exclude_incompatible ) {
					return PublishResult::error(
						409,
						'blixis_publish_blocked',
						[
							'incompatible' => \array_map( static fn ( array $p ): array => $p + [ 'locale' => $locale ], $problems ),
						]
					);
				}
				foreach ( $problems as $problem ) {
					unset( $entries->{$problem['id']} );
				}
				$content_doc->entries = $entries;
				unset( $content_doc->translations );
				$types = \array_intersect_key( $base_types, \get_object_vars( $entries ) );
			}
			$content_number = $this->next( $post_id, '_blixis_snap_content_' . $locale . '_' );
			$content_key    = MetaKeys::snap_content( $locale, $content_number );
			$content_value  = $this->annotate(
				$content_doc,
				$content_key,
				$content_number,
				[
					'baseLayout'     => $content_base,
					'sourceRevision' => $source,
					'elementTypes'   => (object) $types,
				]
			);
		}

		// Impact of a new layout on the other published locales.
		$impacted = [];
		if ( $layout_part ) {
			foreach ( \get_object_vars( $locales ) as $other => $entry ) {
				$other = (string) $other;
				if ( $other === $locale || ! $entry instanceof \stdClass || ! \is_int( $entry->{'contentSnapshot'} ?? null ) ) {
					continue;
				}
				$other_doc = $this->raw( $post_id, MetaKeys::snap_content( $other, $entry->{'contentSnapshot'} ) );
				if ( null === $other_doc ) {
					continue;
				}
				$recorded = \is_object( $other_doc->{'elementTypes'} ?? null ) ? \array_map( 'strval', \get_object_vars( $other_doc->{'elementTypes'} ) ) : [];
				$problems = Compatibility::problems( $this->entries( $other_doc ), $recorded, $new_types, $this->registry );
				if ( [] !== $problems ) {
					$impacted[ $other ] = \array_column( $problems, 'id' );
				} else {
					$entry->{'baseLayout'} = $layout_number;
				}
			}
			if ( [] !== $impacted && ! $o->confirm_impact ) {
				return PublishResult::error(
					409,
					'blixis_publish_blocked',
					[
						'impacted' => \array_map(
							static fn ( string $name, array $ids ): array => [
								'locale' => $name,
								'ids'    => $ids,
							],
							\array_keys( $impacted ),
							\array_values( $impacted )
						),
					]
				);
			}
		}
		if ( null !== $locale && null !== $content_key ) {
			$locales->$locale = (object) [
				'contentSnapshot' => $content_number,
				'baseLayout'      => $content_base,
			];
		}

		$pointer_value = \json_encode( // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure helper used without WordPress.
			[
				'schemaVersion'           => 1,
				'pointerRevision'         => 1,
				'publishedLayoutRevision' => $layout_part ? $layout_number : $published_layout,
				'defaultLocale'           => $default_locale,
				'locales'                 => $locales,
			],
			JSON_THROW_ON_ERROR
		);

		// Snapshots first (immutable), then the single pointer advance.
		if ( null !== $layout_key && null !== $layout_value && null !== $content_key && null !== $content_value ) {
			$this->insert_new( $post_id, $content_key, $content_value );
			$result = $this->snapshots->publish( $post_id, $layout_key, $layout_value, $current, $pointer_value );
		} elseif ( null !== $layout_key && null !== $layout_value ) {
			$result = $this->snapshots->publish( $post_id, $layout_key, $layout_value, $current, $pointer_value );
		} elseif ( null !== $content_key && null !== $content_value ) {
			$result = $this->snapshots->publish( $post_id, $content_key, $content_value, $current, $pointer_value );
		} else {
			return PublishResult::error( 422, 'blixis_nothing_to_publish' );
		}
		if ( ! $result->success ) {
			return PublishResult::error(
				409,
				'blixis_conflict',
				[
					'currentRevision'  => $result->revision,
					'expectedRevision' => $result->expected_revision,
				]
			);
		}
		return PublishResult::ok(
			[
				'pointerRevision' => $result->revision,
				'layoutSnapshot'  => $layout_part ? $layout_number : null,
				'contentSnapshot' => null !== $content_key ? $content_number : null,
				'pinnedLocales'   => \array_keys( $impacted ),
			]
		);
	}

	/**
	 * Revision-stamped snapshot JSON with extra fields.
	 *
	 * @param \stdClass            $doc Decoded source document.
	 * @param string               $key Snapshot key.
	 * @param int                  $number Snapshot number.
	 * @param array<string, mixed> $extra Extra fields.
	 * @return string
	 * @throws \InvalidArgumentException When the snapshot would be invalid.
	 */
	private function annotate( \stdClass $doc, string $key, int $number, array $extra ): string {
		$copy = \json_decode( (string) \json_encode( $doc ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure helper used without WordPress.
		if ( ! $copy instanceof \stdClass ) {
			throw new \InvalidArgumentException( 'Invalid snapshot source.' );
		}
		$copy->{MetaKeys::revision_field( $key )} = $number;
		foreach ( $extra as $name => $value ) {
			$copy->$name = $value;
		}
		$encoded = \json_encode( $copy, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure helper used without WordPress.
		if ( \strlen( $encoded ) > Envelope::MAX_BYTES ) {
			throw new \InvalidArgumentException( 'Snapshot too large.' );
		}
		return $encoded;
	}

	/**
	 * Insert a snapshot row that must not exist yet.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key Snapshot key.
	 * @param string $value Snapshot JSON.
	 * @return void
	 * @throws \RuntimeException When the row exists or cannot be written.
	 */
	private function insert_new( int $post_id, string $key, string $value ): void {
		if ( [] !== $this->database->rows( $post_id, $key ) || ! $this->database->insert( $post_id, $key, $value ) ) {
			throw new \RuntimeException( 'Snapshot insert failed.' );
		}
	}

	/**
	 * The entries object of a content document (`entries`, or the older `translations`).
	 *
	 * @param \stdClass $doc Content document.
	 * @return \stdClass
	 */
	private function entries( \stdClass $doc ): \stdClass {
		$entries = $doc->entries ?? $doc->translations ?? null;
		return $entries instanceof \stdClass ? $entries : new \stdClass();
	}

	/**
	 * The published layout snapshot number of a pointer.
	 *
	 * @param ?\stdClass $pointer Decoded pointer.
	 * @return int
	 */
	private function layout_number( ?\stdClass $pointer ): int {
		$number = $pointer->{'publishedLayoutRevision'} ?? 0;
		return \is_int( $number ) && $number > 0 ? $number : 0;
	}

	/**
	 * Read one stored envelope, or null.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key Meta key.
	 * @return ?\stdClass
	 */
	private function raw( int $post_id, string $key ): ?\stdClass {
		$rows = $this->database->rows( $post_id, $key );
		return 1 === \count( $rows ) ? Envelope::decode( $rows[0]['value'], $key ) : null;
	}

	/**
	 * Next free snapshot number for a key prefix.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $prefix Key prefix up to the number.
	 * @return int
	 */
	private function next( int $post_id, string $prefix ): int {
		$max = 0;
		foreach ( $this->database->snapshot_keys( $post_id ) as $key ) {
			if ( 0 === \strpos( $key, $prefix ) && 1 === \preg_match( '/^[1-9][0-9]*$/D', \substr( $key, \strlen( $prefix ) ) ) ) {
				$max = \max( $max, (int) \substr( $key, \strlen( $prefix ) ) );
			}
		}
		return $max + 1;
	}
}
