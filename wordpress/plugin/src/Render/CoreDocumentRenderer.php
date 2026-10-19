<?php
/** Bounded core document renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Registry\ElementDefinitionRegistry;

\defined( 'ABSPATH' ) || exit;

/** Iterative postorder walk; no PHP call-stack recursion. */
final class CoreDocumentRenderer {
	/**
	 * Element renderers keyed by manifest type.
	 *
	 * @var array<string, ElementRenderer>
	 */
	private readonly array $renderers;
	/**
	 * Localized value selector.
	 *
	 * @var ContentResolver
	 */
	private readonly ContentResolver $content;
	/** Definition-driven renderer dispatch.
	 *
	 * @var ArchetypeRendererRegistry
	 */
	private readonly ArchetypeRendererRegistry $archetypes;
	/** Generated element definitions.
	 *
	 * @var ElementDefinitionRegistry
	 */
	private readonly ElementDefinitionRegistry $definitions;

	/**
	 * Apply the documented contract.
	 *
	 * @param ElementRegistry $registry Registry.
	 * @param MediaResolver   $media Media.
	 */
	public function __construct( private readonly ElementRegistry $registry, MediaResolver $media ) {
		$this->content     = new ContentResolver( $registry );
		$this->definitions = ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__, 2 ) . '/data/element-definitions-v2.json' );
		$this->archetypes  = new ArchetypeRendererRegistry( $this->definitions, new StaticFallbackRenderer() );
		$this->archetypes->register( new DefinitionArchetypeRenderer( $this->definitions, $media ) );
		$this->renderers = [
			'blixis/heading'   => new HeadingRenderer(),
			'blixis/section'   => new SectionRenderer(),
			'blixis/container' => new ContainerRenderer(),
			'blixis/text'      => new TextRenderer(),
			'blixis/image'     => new ImageRenderer( $media ),
			'blixis/button'    => new ButtonRenderer(),
		];
	}

	/**
	 * Render escaped element HTML.
	 *
	 * @param \stdClass                    $document Document.
	 * @param string                       $locale Locale.
	 * @param string                       $mode Mode.
	 * @param array<string, array<string>> $class_names Generated class names by element ID (from the CSS compiler).
	 * @param string                       $fallback Missing-translation policy: `source` or `blank`.
	 * @param ?string[]                    $token_ids Active color token ids; null means unavailable.
	 * @param bool                         $preview Render forms as inert preview markup.
	 * @throws \RuntimeException When limits are exceeded.
	 */
	public function render( \stdClass $document, string $locale, string $mode, array $class_names = [], string $fallback = 'source', ?array $token_ids = null, bool $preview = false ): string {
		// Appearance affects CSS only (compiled separately); the compiler's class names are attached to the elements.
		unset( $mode );
		$roots = \is_array( $document->root ?? null ) ? $document->root : [];
		$stack = [];
		foreach ( \array_reverse( $roots ) as $node ) {
			$stack[] = [ $node, 1, false ];
		}
		$output = [];
		$count  = 0;
		while ( [] !== $stack ) {
			[ $node, $depth, $ready ] = \array_pop( $stack );
			if ( ! $node instanceof \stdClass || ! \is_string( $node->id ?? null ) || ! \is_string( $node->type ?? null ) ) {
				$output[] = '<div data-blx-invalid></div>';
				continue;
			}
			$children = \is_array( $node->children ?? null ) ? $node->children : [];
			if ( ! $ready ) {
				if ( ++$count > 5000 || $depth > 32 ) {
					throw new \RuntimeException( 'Document render limit exceeded.' );
				}
				$stack[] = [ $node, $depth, true ];
				foreach ( \array_reverse( $children ) as $child ) {
					$stack[] = [ $child, $depth + 1, false ];
				}
				continue;
			}
			$child_html_list = [];
			foreach ( $children as $_ ) {
				$child_html_list[] = (string) \array_pop( $output );
			}
			$child_html_list = \array_reverse( $child_html_list );
			$child_html      = \implode( '', $child_html_list );
			$renderer        = $this->renderers[ $node->type ] ?? $this->archetypes->resolve( $node->type );
			if ( ( null === $this->definitions->get( $node->type ) && null === $this->registry->get( $node->type ) ) || 1 !== \preg_match( '/^[a-z0-9][a-z0-9_-]{2,63}$/D', $node->id ) ) {
				$output[] = '<div data-blx-invalid>' . $child_html . '</div>';
				continue;
			}
			$values = isset( $this->renderers[ $node->type ] ) ? $this->content->values( $node, $document, $locale, $fallback ) : $this->definition_values( $node, $document, $locale, $fallback );
			if ( isset( $values['content'] ) && ! isset( $values['text'] ) ) {
				$values['text'] = $values['content']; }
			$output[] = $renderer->render( new ElementNode( $node->id, $node->type, $values, \is_array( $class_names[ $node->id ] ?? null ) ? $class_names[ $node->id ] : [] ), new RenderContext( $child_html, $token_ids, $child_html_list, $preview ) );
		}
		return \implode( '', $output );
	}

	/** Select definition properties and locale streams without depending on the legacy registry shape.
	 *
	 * @param \stdClass $node Element node.
	 * @param \stdClass $document Document.
	 * @param string    $locale Requested content locale.
	 * @param string    $fallback Missing-translation policy.
	 * @return array<string,mixed> Selected properties.
	 */
	private function definition_values( \stdClass $node, \stdClass $document, string $locale, string $fallback ): array {
		$definition = $this->definitions->get( (string) $node->type );
		$values     = [];
		if ( ! is_array( $definition['properties'] ?? null ) ) {
			return $this->content->values( $node, $document, $locale, $fallback );
		}
		foreach ( $definition['properties'] as $name => $property ) {
			if ( ! is_string( $name ) || ! is_array( $property ) ) {
				continue;
			}
			$source_name     = $this->definitions->canonical_property( (string) $node->type, (string) $name );
			$candidate_names = array_unique( [ $name, $source_name, ...$this->definitions->legacy_aliases( (string) $node->type, (string) $name ) ] );
			$value           = $property['default'] ?? null;
			if ( $node->props instanceof \stdClass ) {
				foreach ( $candidate_names as $candidate_name ) {
					if ( property_exists( $node->props, $candidate_name ) ) {
						$value = $node->props->$candidate_name;
						break;
					}
				}
			}
			if ( true === ( $property['localizable'] ?? false ) ) {
				$locales = 'blank' === $fallback ? [ $locale ] : array_unique( [ $locale, (string) ( $document->{'defaultLocale'} ?? '' ) ] );
				foreach ( $locales as $stream_locale ) {
					$entry = $document->translations->$stream_locale->{$node->id}->values ?? null;
					if ( $entry instanceof \stdClass ) {
						foreach ( $candidate_names as $candidate_name ) {
							if ( property_exists( $entry, $candidate_name ) ) {
								$value = $entry->$candidate_name;
								break 2;
							}
						}
					}
				}
			}
			if ( $this->definition_value_valid( $property, $value ) ) {
				$values[ $name ] = $value;
			} elseif ( array_key_exists( 'default', $property ) && $this->definition_value_valid( $property, $property['default'] ) ) {
				$values[ $name ] = $property['default'];
			}
		}
		// Narrow compatibility properties remain layout data, including heading semantics such as `tag`.
		if ( $node->props instanceof \stdClass ) {
			foreach ( \get_object_vars( $node->props ) as $name => $value ) {
				$compatibility = $this->definitions->property( (string) $node->type, (string) $name );
				if ( ! isset( $values[ $name ] ) && is_array( $compatibility ) && ! $this->definitions->localizable( (string) $node->type, (string) $name ) && $this->definition_value_valid( $compatibility, $value ) ) {
					$values[ $name ] = $value;
				}
			}
		}
		return $values;
	}

	/** Validate a property candidate against the v2 definition type.
	 *
	 * @param array<string,mixed> $property Definition property.
	 * @param mixed               $value Candidate value.
	 */
	private function definition_value_valid( array $property, mixed $value ): bool {
		$type  = $property['type'] ?? '';
		$valid = match ( $type ) {
			'string' => is_string( $value ) || ( $value instanceof \stdClass && RichText::valid( $value ) ),
			'url' => is_string( $value ) && \Blixis\Builder\Registry\SafeUrl::accepts( $value ),
			'token' => is_string( $value ),
			'asset-ref' => null === $value || ( is_string( $value ) && 1 === preg_match( '/^(?:(?:asset:)?[A-Za-z0-9_-]{1,128}|attachment:[1-9][0-9]{0,8})$/D', $value ) ),
			'rich-text' => is_string( $value ) || ( $value instanceof \stdClass && RichText::valid( $value ) ),
			'enum', 'iconify-ref' => is_string( $value ) && in_array( $value, $property['options'] ?? [], true ),
			'boolean' => is_bool( $value ), 'number' => \Blixis\Builder\Registry\ElementRegistry::valid_number( $value ),
			'integer' => is_int( $value ),
			'array<string>' => is_array( $value ) && array_is_list( $value ) && count( array_filter( $value, 'is_string' ) ) === count( $value ),
			'array<number>' => is_array( $value ) && array_is_list( $value ) && count( array_filter( $value, [ \Blixis\Builder\Registry\ElementRegistry::class, 'valid_number' ] ) ) === count( $value ),
			'array<object>' => is_array( $value ),
			'object' => $value instanceof \stdClass || ( is_array( $value ) && ! array_is_list( $value ) ),
			'binding', 'query-ref', 'action-ref' => null === $value || $value instanceof \stdClass || ( is_array( $value ) && ! array_is_list( $value ) ),
			default => false,
		};
		if ( ! $valid ) {
			return false; }
		return ! is_numeric( $value ) || ( ( ! isset( $property['min'] ) || $value >= $property['min'] ) && ( ! isset( $property['max'] ) || $value <= $property['max'] ) );
	}
}
