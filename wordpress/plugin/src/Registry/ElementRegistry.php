<?php
/** Immutable PHP element registry.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Registry;

\defined( 'ABSPATH' ) || exit;

/** Validated definitions from the distributable manifest. */
final class ElementRegistry {
	private const MAX_BYTES       = 262144;
	private const API_VERSION     = 2;
	private const CATEGORIES      = [ 'layout', 'content', 'media', 'interactive' ];
	private const CLASSIFICATIONS = [ 'invariant', 'translatable', 'locale-specific' ];
	private const KINDS           = [ 'string', 'text', 'integer', 'number', 'boolean', 'enum', 'url', 'media' ];

	/**
	 * Apply the documented contract.
	 *
	 * @param array<string, array<string, mixed>> $definitions Definitions.
	 */
	private function __construct( private readonly array $definitions ) {}

	/**
	 * Apply the documented contract.
	 *
	 * @param string $file File.
	 * @throws \InvalidArgumentException Invalid manifest.
	 */
	public static function from_manifest_file( string $file ): self {
		$size = \filesize( $file );
		if ( false === $size || $size > self::MAX_BYTES ) {
			throw new \InvalidArgumentException( 'Invalid manifest size.' );
		}
		$json = \file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local committed manifest.
		if ( false === $json ) {
			throw new \InvalidArgumentException( 'Manifest cannot be read.' );
		}
		try {
			$data = \json_decode( $json, true, 64, JSON_THROW_ON_ERROR );
		} catch ( \JsonException $exception ) {
			throw new \InvalidArgumentException( 'Invalid manifest JSON.' );
		}
		return self::from_array( $data );
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param mixed $data Data.
	 * @throws \InvalidArgumentException Invalid definition.
	 */
	public static function from_array( mixed $data ): self {
		try {
			$encoded = \json_encode( $data, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure manifest validation.
		} catch ( \JsonException $exception ) {
			throw new \InvalidArgumentException( 'Invalid manifest value.' );
		}
		if ( \strlen( $encoded ) > self::MAX_BYTES ) {
			throw new \InvalidArgumentException( 'Manifest is too large.' );
		}
		if ( ! \is_array( $data ) || ! self::keys( $data, [ 'apiVersion', 'elements' ] ) || ! \is_int( $data['apiVersion'] ) || $data['apiVersion'] < 1 || $data['apiVersion'] > self::API_VERSION || ! \is_array( $data['elements'] ) || ! \array_is_list( $data['elements'] ) || \count( $data['elements'] ) > 64 ) {
			throw new \InvalidArgumentException( 'Invalid manifest.' );
		}
		$definitions = [];
		foreach ( $data['elements'] as $element ) {
			if ( ! \is_array( $element ) || ! self::keys( $element, [ 'type', 'version', 'title', 'category', 'tier', 'requiresApi', 'props', 'allowedParents', 'allowedChildren' ], [ 'fallback', 'styleProperties' ] ) || ! \is_string( $element['type'] ) || 1 !== \preg_match( '~^[a-z][a-z0-9-]{1,31}/[a-z][a-z0-9-]{1,63}$~D', $element['type'] ) || isset( $definitions[ $element['type'] ] ) || ! \is_int( $element['version'] ) || $element['version'] < 1 || ! \is_string( $element['title'] ) || '' === $element['title'] || \strlen( $element['title'] ) > 80 || ! \in_array( $element['category'], self::CATEGORIES, true ) || ! \in_array( $element['tier'], [ 'free', 'plus', 'pro' ], true ) || ! \is_int( $element['requiresApi'] ) || $element['requiresApi'] < 1 || $element['requiresApi'] > $data['apiVersion'] || ! \is_array( $element['props'] ) || ( \array_is_list( $element['props'] ) && [] !== $element['props'] ) ) {
				throw new \InvalidArgumentException( 'Invalid element definition.' );
			}
			if ( isset( $element['styleProperties'] ) ) {
				$style_properties = $element['styleProperties'];
				if ( ! \is_array( $style_properties ) || ! \array_is_list( $style_properties ) || \count( $style_properties ) > 64 ) {
					throw new \InvalidArgumentException( 'Invalid style property list.' );
				}
				$seen_style_properties = [];
				foreach ( $style_properties as $style_property ) {
					if ( ! \is_string( $style_property ) || 1 !== \preg_match( '/^[a-z][a-z0-9-]{0,63}$/D', $style_property ) || isset( $seen_style_properties[ $style_property ] ) ) {
						throw new \InvalidArgumentException( 'Invalid style property.' );
					}
					$seen_style_properties[ $style_property ] = true;
				}
			}
			if ( ( 'free' === $element['tier'] && isset( $element['fallback'] ) ) || ( 'free' !== $element['tier'] && ! \in_array( $element['fallback'] ?? null, [ 'static', 'retained', 'unavailable' ], true ) ) ) {
				throw new \InvalidArgumentException( 'Invalid fallback.' );
			}
			foreach ( [ 'allowedParents', 'allowedChildren' ] as $field ) {
				$entries = $element[ $field ];
				if ( ! \is_array( $entries ) || ! \array_is_list( $entries ) || \count( $entries ) > 64 || ( 'allowedParents' === $field && [] === $entries ) ) {
					throw new \InvalidArgumentException( 'Invalid nesting list.' );
				}
				foreach ( $entries as $entry ) {
					if ( ! \is_string( $entry ) || ( '#root' === $entry && 'allowedChildren' === $field ) || ( '#root' !== $entry && ! \in_array( $entry, [ '@layout', '@content', '@media', '@interactive' ], true ) && 1 !== \preg_match( '~^[a-z][a-z0-9-]{1,31}/[a-z][a-z0-9-]{1,63}$~D', $entry ) ) ) {
						throw new \InvalidArgumentException( 'Invalid nesting entry.' );
					}
				}
			}
			foreach ( $element['props'] as $name => $prop ) {
				if ( ! \is_string( $name ) || 1 !== \preg_match( '/^[a-z][a-zA-Z0-9]{0,63}$/D', $name ) || ! \is_array( $prop ) || ! isset( $prop['kind'], $prop['classification'], $prop['label'] ) || ! \in_array( $prop['kind'], self::KINDS, true ) || ! \in_array( $prop['classification'], self::CLASSIFICATIONS, true ) || ! \is_string( $prop['label'] ) || '' === $prop['label'] || \strlen( $prop['label'] ) > 80 ) {
					throw new \InvalidArgumentException( 'Invalid property definition.' );
				}
				if ( 'number' === $prop['kind'] && ( 2 !== $element['requiresApi'] || 2 !== $data['apiVersion'] ) ) {
					throw new \InvalidArgumentException( 'Number properties require extension API 2.' );
				}
				$extra = match ( $prop['kind'] ) {
					'string' => [ 'maxLength' ], 'text' => [ 'maxLength', 'inline' ], 'integer', 'number' => [ 'min', 'max' ], 'enum' => [ 'values' ], default => [],
				};
				$optional = 'text' === $prop['kind'] ? [ 'required', 'default', 'marks' ] : [ 'required', 'default' ];
				if ( ! self::keys( $prop, \array_merge( [ 'kind', 'classification', 'label' ], $extra ), $optional ) || ( isset( $prop['required'] ) && ! \is_bool( $prop['required'] ) ) || ( 'translatable' === $prop['classification'] && ! \in_array( $prop['kind'], [ 'string', 'text' ], true ) ) || ( 'text' === $prop['kind'] && ( true !== ( $prop['inline'] ?? null ) || ( isset( $prop['marks'] ) && ( ! \is_array( $prop['marks'] ) || ! \array_is_list( $prop['marks'] ) || [] === $prop['marks'] || [] !== \array_diff( $prop['marks'], [ 'strong', 'em', 'u', 's', 'code', 'link', 'style' ] ) ) ) ) ) || ( 'locale-specific' === $prop['classification'] && ! \in_array( $prop['kind'], [ 'string', 'url', 'media' ], true ) ) || ( ( $prop['required'] ?? false ) && ( 'invariant' !== $prop['classification'] || ! \array_key_exists( 'default', $prop ) ) ) ) {
					throw new \InvalidArgumentException( 'Invalid property rules.' );
				}
				if ( 'enum' === $prop['kind'] && \is_array( $prop['values'] ) ) {
					foreach ( $prop['values'] as $option ) {
						if ( ! \is_string( $option ) || '' === $option || \strlen( $option ) > 40 ) {
							throw new \InvalidArgumentException( 'Invalid enum option.' );
						}
					}
				}
				if ( ( \in_array( $prop['kind'], [ 'string', 'text' ], true ) && ( ! \is_int( $prop['maxLength'] ) || $prop['maxLength'] < 1 || $prop['maxLength'] > 100000 ) ) || ( 'integer' === $prop['kind'] && ( ! \is_int( $prop['min'] ) || ! \is_int( $prop['max'] ) || $prop['min'] > $prop['max'] ) ) || ( 'number' === $prop['kind'] && ( ! self::valid_number( $prop['min'] ) || ! self::valid_number( $prop['max'] ) || $prop['min'] > $prop['max'] ) ) || ( 'enum' === $prop['kind'] && ( ! \is_array( $prop['values'] ) || ! \array_is_list( $prop['values'] ) || [] === $prop['values'] || \count( $prop['values'] ) > 32 ) ) || ( \array_key_exists( 'default', $prop ) && ! self::valid_value( $prop, $prop['default'] ) ) ) {
					throw new \InvalidArgumentException( 'Invalid property constraints.' );
				}
			}
			$definitions[ $element['type'] ] = $element;
		}
		return new self( $definitions );
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param list<array<string, mixed>> $definitions Definitions.
	 */
	public function with( array $definitions ): self {
		return self::from_array(
			[
				'apiVersion' => self::API_VERSION,
				'elements'   => \array_merge( \array_values( $this->definitions ), $definitions ),
			]
		);
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param string $type Type.
	 * @return array<string, mixed>|null Definition.
	 */
	public function get( string $type ): ?array {
		return $this->definitions[ $type ] ?? null;
	}

	/** Whether any registered definition declares this property as inline text.
	 *
	 * @param string $property Property id.
	 */
	public function is_inline_text_property( string $property ): bool {
		foreach ( $this->definitions as $definition ) {
			$prop = $definition['props'][ $property ] ?? null;
			if ( \is_array( $prop ) && 'text' === ( $prop['kind'] ?? null ) && true === ( $prop['inline'] ?? false ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param ?string $parent_type Parent type.
	 * @param string  $child_type Child type.
	 * @param string  $intent Intent.
	 */
	public function can_nest( ?string $parent_type, string $child_type, string $intent = 'create' ): bool {
		$parent = null === $parent_type ? null : $this->get( $parent_type );
		$child  = $this->get( $child_type );
		if ( null !== $parent_type && null === $parent ) {
			return false;
		}
		if ( null === $child ) {
			return 'relocate' === $intent && ( null === $parent || [] !== $parent['allowedChildren'] );
		}
		$accepts = static fn ( array $entries, ?array $element ): bool => \in_array( null === $element ? '#root' : $element['type'], $entries, true ) || ( null !== $element && \in_array( '@' . $element['category'], $entries, true ) );
		return ( null === $parent || $accepts( $parent['allowedChildren'], $child ) ) && $accepts( $child['allowedParents'], $parent );
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param array<string, mixed> $prop Prop.
	 * @param mixed                $value Value.
	 */
	public static function valid_value( array $prop, mixed $value ): bool {
		return match ( $prop['kind'] ) {
			'string' => \is_string( $value ) && SafeUrl::utf16_length( $value ) <= $prop['maxLength'],
			'text' => ( \is_string( $value ) && SafeUrl::utf16_length( $value ) <= $prop['maxLength'] ) || ( $value instanceof \stdClass && \Blixis\Builder\Render\RichText::valid( $value, [], $prop['marks'] ?? [] ) && SafeUrl::utf16_length( \Blixis\Builder\Render\RichText::plain( $value ) ) <= $prop['maxLength'] ),
			'integer' => \is_int( $value ) && $value >= $prop['min'] && $value <= $prop['max'],
			'number' => ( \is_int( $value ) || \is_float( $value ) ) && self::valid_number( $value ) && $value >= $prop['min'] && $value <= $prop['max'],
			'boolean' => \is_bool( $value ),
			'enum' => \is_string( $value ) && \in_array( $value, $prop['values'], true ),
			'url' => \is_string( $value ) && SafeUrl::accepts( $value ),
			'media' => \is_int( $value ) && $value > 0,
			default => false,
		};
	}

	/** Check the document number contract: safe integer or bounded four-place decimal.
	 *
	 * @param mixed $value Candidate value.
	 */
	public static function valid_number( mixed $value ): bool {
		if ( ! \is_int( $value ) && ! \is_float( $value ) ) {
			return false;
		}
		if ( \is_int( $value ) ) {
			return \abs( $value ) <= 9007199254740991;
		}
		if ( ! \is_finite( $value ) || \abs( $value ) < 0.0001 || \abs( $value ) > 1000000000 ) {
			return false;
		}
		$canonical = \rtrim( \rtrim( \number_format( $value, 4, '.', '' ), '0' ), '.' );
		return (float) $canonical === $value;
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param array         $data Data.
	 * @phpstan-param array<array-key, mixed> $data
	 * @param array<string> $required Required.
	 * @param array<string> $optional Optional.
	 */
	private static function keys( array $data, array $required, array $optional = [] ): bool {
		foreach ( $required as $key ) {
			if ( ! \array_key_exists( $key, $data ) ) {
				return false;
			}
		}
		return [] === \array_diff( \array_keys( $data ), \array_merge( $required, $optional ) );
	}
}
