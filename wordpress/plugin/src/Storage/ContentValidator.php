<?php
/**
 * Structural validation of locale content streams.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
use Blixis\Builder\Registry\SafeUrl;

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
	/** Generated definition registry used for v2 localized inline text.
	 *
	 * @var ElementDefinitionRegistry
	 */
	private readonly ElementDefinitionRegistry $definitions;
	/** Cached property ids admitted as definition-driven inline text.
	 *
	 * @var array<string,true>
	 */
	private array $definition_text_properties = [];

	/** Use the registry to restrict rich values to declared inline text properties.
	 *
	 * @param ?ElementRegistry $registry Element property registry.
	 */
	public function __construct( ?ElementRegistry $registry = null ) {
		$this->registry    = $registry ?? ElementRegistry::from_manifest_file( \dirname( __DIR__, 2 ) . '/data/core-elements.json' );
		$this->definitions = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__, 2 ) . '/data/element-definitions-v2.json' );
		foreach ( $this->definitions->all() as $definition ) {
			foreach ( $definition['properties'] as $name => $property ) {
				if ( 'alt' !== $name && is_array( $property ) && true === ( $property['localizable'] ?? false ) && ( 'rich-text' === ( $property['type'] ?? null ) || 'textarea' === ( $property['control'] ?? null ) ) ) {
					$this->definition_text_properties[ (string) $name ] = true;
				}
			}
		}
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
			$rich_property = $this->registry->is_inline_text_property( (string) $name );
			$rich_property = $rich_property || isset( $this->definition_text_properties[ (string) $name ] );
			$scalar        = \is_int( $item ) || \is_bool( $item ) || null === $item || ( \is_string( $item ) && \strlen( $item ) <= self::MAX_STRING ) || ( $item instanceof \stdClass && $rich_property && \Blixis\Builder\Render\RichText::valid( $item ) ) || ( 'items' === $name && $this->valid_navigation_items( $item ) );
			if ( 1 !== \preg_match( '/^[a-z][A-Za-z0-9]{0,63}$/D', (string) $name ) || ! $scalar ) {
				return false;
			}
		}
		return true;
	}

	/** Validate the bounded navigation value allowed in localized content.
	 *
	 * @param mixed $items Candidate navigation list.
	 */
	private function valid_navigation_items( mixed $items ): bool {
		$count = 0;
		return $this->navigation_items_ok( $items, 0, $count );
	}

	/** Validate one nested navigation list without exceeding depth or total item bounds.
	 *
	 * @param mixed $items Candidate list.
	 * @param int   $depth Current depth.
	 * @param int   $count Total visited items, updated by reference.
	 */
	private function navigation_items_ok( mixed $items, int $depth, int &$count ): bool {
		if ( ! \is_array( $items ) || ! \array_is_list( $items ) || $depth > 8 || \count( $items ) > 100 ) {
			return false;
		}
		foreach ( $items as $item ) {
			if ( $item instanceof \stdClass ) {
				$item = \get_object_vars( $item );
			}
			if ( ! \is_array( $item ) || ++$count > 100 || [] !== \array_diff( \array_keys( $item ), [ 'label', 'href', 'current', 'children' ] ) || ! \is_string( $item['label'] ?? null ) || \strlen( $item['label'] ) > 300 || 1 !== \preg_match( '//u', $item['label'] ) || 1 === \preg_match( '/[\x00-\x1F\x7F-\x9F<>]/u', $item['label'] ) || ( isset( $item['href'] ) && ( ! \is_string( $item['href'] ) || ! SafeUrl::accepts( $item['href'] ) ) ) || ( isset( $item['current'] ) && ! \is_bool( $item['current'] ) ) ) {
				return false;
			}
			if ( isset( $item['children'] ) && ! $this->navigation_items_ok( $item['children'], $depth + 1, $count ) ) {
				return false;
			}
		}
		return true;
	}
}
