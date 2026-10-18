<?php
/** Definition-driven v2 registry metadata.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Registry;

\defined( 'ABSPATH' ) || exit;

/** Reads the generated v2 manifest without applying entitlement to rendering. */
final class ElementDefinitionRegistry {
	private const MAX_BYTES  = 4194304;
	private const LEGACY_IDS = [
		'page'                     => 'stack',
		'navigation'               => 'navigation-menu',
		'site-header'              => 'sticky-header',
		'site-footer'              => 'stack',
		'text'                     => 'site-title',
		// Bundled WooCommerce templates retain their provider-specific saved IDs.
		'woocommerce-cart-link'    => 'cart-icon',
		'woocommerce-product-grid' => 'product-grid',
	];

	/** Construct from validated definitions.
	 *
	 * @param array<string, array<string, mixed>> $definitions Definitions indexed by id.
	 */
	private function __construct( private readonly array $definitions ) {}

	/** Load and validate the generated manifest.
	 *
	 * @param string $file Manifest file path.
	 * @throws \InvalidArgumentException If the generated file is malformed.
	 */
	public static function from_manifest_file( string $file ): self {
		$size = \filesize( $file );
		if ( false === $size || $size > self::MAX_BYTES ) {
			throw new \InvalidArgumentException( 'Invalid v2 element manifest size.' );
		}
		$json = \file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local generated manifest.
		if ( false === $json ) {
			throw new \InvalidArgumentException( 'V2 element manifest cannot be read.' );
		}
		try {
			$data = \json_decode( $json, true, 64, JSON_THROW_ON_ERROR );
		} catch ( \JsonException $exception ) {
			throw new \InvalidArgumentException( 'Invalid v2 element manifest JSON.' );
		}
		if ( ! \is_array( $data ) || '2.0.0' !== ( $data['schemaVersion'] ?? null ) || ! \is_array( $data['definitions'] ?? null ) || 253 !== \count( $data['definitions'] ) ) {
			throw new \InvalidArgumentException( 'Invalid v2 element manifest.' );
		}
		$definitions = [];
		foreach ( $data['definitions'] as $definition ) {
			if ( ! \is_array( $definition ) || ! \is_string( $definition['id'] ?? null ) || 1 !== \preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $definition['id'] ) || ! \is_array( $definition['properties'] ?? null ) || ! \in_array( $definition['status'] ?? null, [ 'ready', 'planned' ], true ) || ! \is_array( $definition['subscription'] ?? null ) || ! \in_array( $definition['subscription']['minimumTier'] ?? null, [ 'free', 'plus', 'pro' ], true ) || isset( $definitions[ $definition['id'] ] ) ) {
				throw new \InvalidArgumentException( 'Invalid v2 element definition.' );
			}
			$definitions[ $definition['id'] ] = $definition;
		}
		return new self( $definitions );
	}

	/** Look up an element by definition id or namespaced type.
	 *
	 * @param string $type Definition id or registered type.
	 * @return array<string, mixed>|null Definition metadata.
	 */
	public function get( string $type ): ?array {
		$id = \str_starts_with( $type, 'blixis/' ) ? \substr( $type, 7 ) : $type;
		$id = self::LEGACY_IDS[ $id ] ?? $id;
		return $this->definitions[ $id ] ?? null;
	}

	/** Return a normalized property specification, including documented document aliases.
	 *
	 * @param string $type Element type or definition id.
	 * @param string $name Property name.
	 * @return array<string,mixed>|null Property specification.
	 */
	public function property( string $type, string $name ): ?array {
		$id = \str_starts_with( $type, 'blixis/' ) ? \substr( $type, 7 ) : $type;
		if ( in_array( $id, [ 'woocommerce-cart-link', 'woocommerce-product-grid' ], true ) ) {
			$id = self::LEGACY_IDS[ $id ];
		}
		if ( 'product-grid' === $id && 'columns' === $name ) {
			return [ 'type' => 'object' ];
		}
		$aliases    = [
			'heading'   => [ 'text' => 'content' ],
			'text'      => [ 'text' => 'content' ],
			'paragraph' => [ 'text' => 'content' ],
			'rich-text' => [ 'text' => 'content' ],
			'button'    => [
				'text'    => 'label',
				'content' => 'label',
			],
			'image'     => [ 'text' => 'alt' ],
		];
		$name       = $aliases[ $id ][ $name ] ?? $name;
		$definition = $this->get( $id );
		$property   = is_array( $definition['properties'] ?? null ) ? ( $definition['properties'][ $name ] ?? null ) : null;
		if ( is_array( $property ) ) {
			return $property;
		}
		// Compatibility fields absent from the catalog are deliberately narrow and typed.
		$compat = [
			'cart-icon'    => [
				'showCount'    => [ 'type' => 'boolean' ],
				'showSubtotal' => [ 'type' => 'boolean' ],
			],
			'heading'      => [
				'level' => [
					'type' => 'integer',
					'min'  => 1,
					'max'  => 6,
				],
				'tag'   => [
					'type'    => 'enum',
					'options' => [ 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' ],
				],
			],
			'button'       => [
				'target' => [
					'type'    => 'enum',
					'options' => [ '_self', '_blank' ],
				],
			],
			'container'    => [ 'maxWidthToken' => [ 'type' => 'token' ] ],
			'image'        => [
				'attachmentId' => [ 'type' => 'media-id' ],
				'fit'          => [
					'type'    => 'enum',
					'options' => [ 'cover', 'contain' ],
				],
				'loading'      => [
					'type'    => 'enum',
					'options' => [ 'lazy', 'eager' ],
				],
			],
			'product-grid' => [
				'columns'           => [ 'type' => 'object' ],
				'query'             => [ 'type' => 'object' ],
				'productCard'       => [ 'type' => 'object' ],
				'placeholderAssets' => [ 'type' => 'array<string>' ],
			],
			'section'      => [
				'tag'     => [
					'type'    => 'enum',
					'options' => [ 'div', 'section', 'header', 'footer', 'main', 'aside', 'nav', 'article' ],
				],
				'variant' => [ 'type' => 'string' ],
			],
			'columns'      => [
				'ratios'  => [ 'type' => 'array<number>' ],
				'stackAt' => [ 'type' => 'string' ],
			],
			'grid'         => [
				'columns'  => [ 'type' => 'object' ],
				'gapToken' => [ 'type' => 'token' ],
			],
			'row'          => [ 'gapToken' => [ 'type' => 'token' ] ],
			'stack'        => [ 'gapToken' => [ 'type' => 'token' ] ],
			'card'         => [ 'variant' => [ 'type' => 'string' ] ],
			'navigation'   => [ 'items' => [ 'type' => 'array<object>' ] ],
			'site-header'  => [ 'sticky' => [ 'type' => 'boolean' ] ],
			'site-logo'    => [
				'assetRef' => [ 'type' => 'asset-ref' ],
				'link'     => [ 'type' => 'url' ],
			],
			'text'         => [ 'content' => [ 'type' => 'string' ] ],
		];
		return $compat[ $id ][ $name ] ?? null;
	}

	/** Whether a definition permits a localized value under a stored property name.
	 *
	 * @param string $type Element type.
	 * @param string $name Stored property.
	 */
	public function localizable( string $type, string $name ): bool {
		$definition = $this->get( $type );
		$property   = $this->property( $type, $name );
		return is_array( $definition ) && is_array( $property ) && true === ( $property['localizable'] ?? false );
	}

	/** Canonical definition property for a legacy alias.
	 *
	 * @param string $type Element type.
	 * @param string $name Stored property.
	 */
	public function canonical_property( string $type, string $name ): string {
		$id      = str_starts_with( $type, 'blixis/' ) ? substr( $type, 7 ) : $type;
		$aliases = [
			'heading'   => [ 'text' => 'content' ],
			'text'      => [ 'text' => 'content' ],
			'paragraph' => [ 'text' => 'content' ],
			'rich-text' => [ 'text' => 'content' ],
			'button'    => [
				'text'    => 'label',
				'content' => 'label',
			],
		];
		return $aliases[ $id ][ $name ] ?? $name;
	}

	/** Legacy property spellings that may still occur in saved layout or content streams.
	 *
	 * @param string $type Element type.
	 * @param string $canonical Canonical definition property.
	 * @return list<string> Legacy aliases.
	 */
	public function legacy_aliases( string $type, string $canonical ): array {
		$id = str_starts_with( $type, 'blixis/' ) ? substr( $type, 7 ) : $type;
		return match ( $id ) {
			'heading', 'text', 'paragraph', 'rich-text' => 'content' === $canonical ? [ 'text' ] : [],
			'button' => 'label' === $canonical ? [ 'content', 'text' ] : [],
			'image' => 'alt' === $canonical ? [ 'text' ] : [],
			default => [],
		};
	}

	/** Read the entitlement filter for editor metadata only.
	 *
	 * Renderer dispatch never consults this value.
	 *
	 * @param string $element_id Definition id.
	 */
	public function entitlement( string $element_id ): string {
		$value = \function_exists( 'apply_filters' ) ? \apply_filters( 'blixis_builder_element_entitlement', 'available', $element_id ) : 'available';
		return \is_string( $value ) && '' !== $value ? $value : 'available';
	}

	/** Return every definition.
	 *
	 * @return list<array<string, mixed>> Definitions.
	 */
	public function all(): array {
		return \array_values( $this->definitions );
	}
}
