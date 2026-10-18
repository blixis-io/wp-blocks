<?php
/** Validate v2 element properties before persistence.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Registry;

\defined( 'ABSPATH' ) || exit;

/** Fail-closed property validation for definition-backed document nodes. */
final class DefinitionPropsValidator {
	/** Create validator.
	 *
	 * @param ElementDefinitionRegistry $definitions Definition metadata.
	 */
	public function __construct( private readonly ElementDefinitionRegistry $definitions ) {}

	/** Validate known v2 node props and recursively inspect children.
	 *
	 * @param \stdClass $node Node.
	 */
	public function accepts( \stdClass $node ): bool {
		$type = $node->type ?? null;
		if ( ! is_string( $type ) ) {
			return false; }
		$definition = $this->definitions->get( $type );
		if ( null !== $definition ) {
			$props = $node->props ?? new \stdClass();
			if ( ! $props instanceof \stdClass ) {
				return false; }
			foreach ( get_object_vars( $props ) as $name => $value ) {
				$property = $this->definitions->property( $type, $name );
				if ( null === $property || ! $this->value( $property, $value ) ) {
					return false; }
			}
		}
		foreach ( is_array( $node->children ?? null ) ? $node->children : [] as $child ) {
			if ( ! $child instanceof \stdClass || ! $this->accepts( $child ) ) {
				return false; }
		}
		return true;
	}

	/** Validate one property value.
	 *
	 * @param array<string,mixed> $property Property contract.
	 * @param mixed               $value Candidate value.
	 */
	private function value( array $property, mixed $value ): bool {
		$type = $property['type'] ?? '';
		if ( is_string( $type ) && str_starts_with( $type, 'array<' ) && str_ends_with( $type, '>' ) ) {
			if ( ! is_array( $value ) || ! array_is_list( $value ) ) {
				return false;
			}
			$item_property         = $property;
			$item_property['type'] = substr( $type, 6, -1 );
			foreach ( $value as $item ) {
				if ( ! $this->value( $item_property, $item ) ) {
					return false;
				}
			}
			return true;
		}
		$valid = match ( $type ) {
			'string' => is_string( $value ) || ( $value instanceof \stdClass && \Blixis\Builder\Render\RichText::valid( $value ) ),
			'url', 'token' => is_string( $value ),
			'asset-ref' => null === $value || ( is_string( $value ) && 1 === preg_match( '/^(?:(?:asset:)?[A-Za-z0-9_-]{1,128}|attachment:[1-9][0-9]{0,8})$/D', $value ) ),
			'rich-text' => is_string( $value ) || ( $value instanceof \stdClass && \Blixis\Builder\Render\RichText::valid( $value ) ),
			'enum', 'iconify-ref' => is_string( $value ) && in_array( $value, $property['options'] ?? [], true ),
			'boolean' => is_bool( $value ), 'number' => is_int( $value ) || is_float( $value ), 'integer' => is_int( $value ),
			'object' => $value instanceof \stdClass || ( is_array( $value ) && ! array_is_list( $value ) ),
			'media-id' => null === $value || ( is_int( $value ) && $value >= 0 ),
			default => false,
		};
		if ( ! $valid ) {
			return false; }
		return ! is_numeric( $value ) || ( ( ! isset( $property['min'] ) || $value >= $property['min'] ) && ( ! isset( $property['max'] ) || $value <= $property['max'] ) );
	}
}
