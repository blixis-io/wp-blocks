<?php
/**
 * Structural validation of locale content streams.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

use Blixis\Builder\Registry\ElementRegistry;

\defined( 'ABSPATH' ) || exit;

/**
 * A content stream is `{ schemaVersion, contentRevision, locale?, entries: { <elementId>: { status?, values?, sourceHash? } } }`.
 * Only shape and bounds are checked here (element existence and translatable properties are checked when publishing,
 * because the layout may change independently). Inline values are validated by Render\RichText.
 */
final class ContentValidator implements DocumentValidator {
	public const STATUSES     = [ 'missing', 'draft', 'translated', 'reviewed', 'stale', 'orphaned' ];
	private const MAX_ENTRIES = 5000;
	private const MAX_VALUES  = 32;
	private const MAX_STRING  = 20000;
	/** Registry used to gate rich text properties.
	 *
	 * @var ElementRegistry
	 */
	private readonly ElementRegistry $registry;

	/** Use the registry to restrict rich values to declared inline text properties.
	 *
	 * @param ?ElementRegistry $registry Element property registry.
	 */
	public function __construct( ?ElementRegistry $registry = null ) {
		$this->registry = $registry ?? ElementRegistry::from_manifest_file( \dirname( __DIR__, 2 ) . '/data/core-elements.json' );
	}

	/**
	 * Check a content envelope.
	 *
	 * @param string $value Stream JSON.
	 * @param string $key Stream key.
	 * @return bool
	 */
	public function accepts( string $value, string $key ): bool {
		$data = Envelope::decode( $value, $key );
		if ( null === $data ) {
			return false;
		}
		foreach ( [ 'entries', 'translations' ] as $field ) {
			if ( \property_exists( $data, $field ) && ! $this->entries_ok( $data->$field ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Check the entries object.
	 *
	 * @param mixed $entries Decoded entries.
	 * @return bool
	 */
	private function entries_ok( mixed $entries ): bool {
		if ( ! $entries instanceof \stdClass ) {
			return false;
		}
		$vars = \get_object_vars( $entries );
		if ( \count( $vars ) > self::MAX_ENTRIES ) {
			return false;
		}
		foreach ( $vars as $id => $entry ) {
			if ( 1 !== \preg_match( '/^[a-z0-9][a-z0-9_-]{2,63}$/D', (string) $id ) || ! $this->entry_ok( $entry ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Check one entry.
	 *
	 * @param mixed $entry Decoded entry.
	 * @return bool
	 */
	private function entry_ok( mixed $entry ): bool {
		if ( ! $entry instanceof \stdClass || [] !== \array_diff( \array_keys( \get_object_vars( $entry ) ), [ 'status', 'values', 'sourceHash' ] ) ) {
			return false;
		}
		if ( \property_exists( $entry, 'status' ) && ! \in_array( $entry->status, self::STATUSES, true ) ) {
			return false;
		}
		if ( \property_exists( $entry, 'sourceHash' ) && ( ! \is_string( $entry->{'sourceHash'} ) || 1 !== \preg_match( '/^[0-9a-f]{16}$/D', $entry->{'sourceHash'} ) ) ) {
			return false;
		}
		if ( ! \property_exists( $entry, 'values' ) ) {
			return true;
		}
		if ( ! $entry->values instanceof \stdClass ) {
			return false;
		}
		$values = \get_object_vars( $entry->values );
		if ( \count( $values ) > self::MAX_VALUES ) {
			return false;
		}
		foreach ( $values as $name => $item ) {
			$scalar = \is_int( $item ) || \is_bool( $item ) || null === $item || ( \is_string( $item ) && \strlen( $item ) <= self::MAX_STRING ) || ( $item instanceof \stdClass && $this->registry->is_inline_text_property( (string) $name ) && \Blixis\Builder\Render\RichText::valid( $item ) );
			if ( 1 !== \preg_match( '/^[a-z][A-Za-z0-9]{0,63}$/D', (string) $name ) || ! $scalar ) {
				return false;
			}
		}
		return true;
	}
}
