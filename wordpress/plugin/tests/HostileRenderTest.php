<?php
/**
 * Cross-element hostile rendering corpus.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Preview\PreviewSanitizer;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Render\AssetReferenceResolver;
use Blixis\Builder\Render\CoreDocumentRenderer;
use Blixis\Builder\Render\MediaResolver;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Independent HTML parser checks complement the final preview sanitizer. */
final class HostileRenderTest extends TestCase {
	/** Invalid rich content is reduced to escaped plain text for public readers. */
	public function test_invalid_rich_value_degrades_to_plain_text(): void {
		$media    = new class() implements MediaResolver {
			/** No media is used by text.
			 *
			 * @param int $id Attachment ID.
			 */
			public function resolve( int $id ): ?array {
				return null;
			}
		};
		$renderer = new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $media );
		$document = (object) [
			'root'          => [
				(object) [
					'id'       => 'txt-1',
					'type'     => 'blixis/text',
					'props'    => (object) [],
					'children' => [],
				],
			],
			'defaultLocale' => 'en_US',
			'translations'  => (object) [ 'en_US' => (object) [ 'txt-1' => (object) [ 'values' => (object) [ 'text' => \json_decode( '{"v":1,"inline":[{"t":"text","s":"<img src=x onerror=alert(1)>"},{"t":"script","s":"discarded"}]}' ) ] ] ] ],
		];
		$html     = $renderer->render( $document, 'en_US', 'light' );
		$this->assertStringContainsString( '&lt;img src=x onerror=alert(1)&gt;', $html );
		$this->assertStringNotContainsString( '<img', $html );
	}
	/** New template alias renderers keep untrusted content, tags, URLs and repeater labels inert. */
	public function test_v2_template_renderer_escapes_hostile_props_and_uses_tag_allowlists(): void {
		$media    = new class() implements MediaResolver {
			/** No media in the hostile-content fixture.
			 *
			 * @param int $id Attachment id.
			 */
			/** Resolve an attachment fixture.
			 *
			 * @param int $id Attachment id.
			 */
			public function resolve( int $id ): ?array {
				return null; }
		};
		$renderer = new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $media );
		$document = (object) [
			'root' => [
				(object) [
					'id'       => 'head-1',
					'type'     => 'heading',
					'props'    => (object) [
						'tag'     => 'script',
						'content' => '<img src=x onerror=alert(1)>',
					],
					'children' => [],
				],
				(object) [
					'id'       => 'nav-1',
					'type'     => 'navigation',
					'props'    => (object) [
						'items' => \json_decode( '[{\"label\":\"<script>x</script>\",\"link\":\"javascript:alert(1)\",\"children\":[{\"label\":\"Child\",\"href\":\"/child\",\"current\":true}]}]' ),
					],
					'children' => [],
				],
			],
		];
		$document = \json_decode( (string) \wp_json_encode( $document ) );
		$html     = $renderer->render( $document, 'en_US', 'light' );
		$this->assertStringNotContainsString( '<script>', $html );
		$this->assertStringNotContainsString( '<img', $html );
		$this->assertStringContainsString( '&lt;img', $html );
		$this->assertStringContainsString( 'href="/"', $html );
		$this->assertStringContainsString( 'Home', $html );
	}
	/** Wrong typed v2 properties fall back to defaults and unknown props are discarded. */
	public function test_v2_wrong_typed_properties_cannot_reach_archetype_renderer(): void {
		$media    = new class() implements MediaResolver {
			/** Resolve an attachment fixture.
			 *
			 * @param int $id Attachment id.
			 */
			public function resolve( int $id ): ?array {
				return null; }
		};
		$renderer = new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $media );
		$document = \json_decode( '{"root":[{"id":"head-1","type":"heading","props":{"content":5,"ariaLabel":{"bad":true},"unknown":"injected"},"children":[]}]}' );
		$html     = $renderer->render( $document, 'en_US', 'light' );
		$this->assertStringContainsString( 'Sample text', $html );
		$this->assertStringNotContainsString( 'injected', $html );
	}

	/** Asset refs go through the media resolver and never become raw URLs. */
	public function test_template_asset_reference_is_resolved_and_url_guarded(): void {
		$media    = new class() implements AssetReferenceResolver {
			/** No attachment id lookup is used in this fixture.
			 *
			 * @param int $id Attachment id.
			 */
			/** Resolve an attachment fixture.
			 *
			 * @param int $id Attachment id.
			 */
			public function resolve( int $id ): ?array {
				return null; }
			/** Return fixture media for a stable pack asset key.
			 *
			 * @param string $reference Asset reference.
			 */
			public function resolve_reference( string $reference ): ?array {
				if ( '' === $reference ) {
					return null;
				}
				return [
					'url'    => 'https://media.example.test/logo.png',
					'width'  => 20,
					'height' => 10,
					'alt'    => '<logo>',
				];
			}
		};
		$renderer = new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $media );
		$document = (object) [
			'root' => [
				(object) [
					'id'       => 'logo-1',
					'type'     => 'site-logo',
					'props'    => (object) [
						'assetRef' => 'brand',
						'link'     => 'javascript:alert(2)',
					],
					'children' => [],
				],
			],
		];
		$document = \json_decode( (string) \wp_json_encode( $document ) );
		$html     = $renderer->render( $document, 'en_US', 'light' );
		$this->assertStringContainsString( 'href="/"', $html );
		$this->assertStringContainsString( 'src="https://media.example.test/logo.png"', $html );
		$this->assertStringContainsString( 'alt="&lt;logo&gt;"', $html );
		$this->assertStringNotContainsString( 'javascript:', $html );
	}

	/**
	 * Malicious strings reused across every element and property.
	 *
	 * @return array<string,array{string}>
	 */
	public static function hostile_strings(): array {
		return [
			'markup'         => [ '<script>alert(1)</script><img src=x onerror=alert(1)>' ],
			'breakout'       => [ '"><script>alert(1)</script>' ],
			'style'          => [ '</style><script>alert(1)</script>' ],
			'schemes'        => [ 'JaVaScRiPt:alert(1) data:text/html,x vbscript:x file:///etc/passwd' ],
			'entities'       => [ 'java&#x73;cript:alert(1)' ],
			'whitespace'     => [ "java\tscript:\nalert(1)" ],
			'null'           => [ "x\0onclick=alert(1)" ],
			'rtl'            => [ "abc\u{202e}tpircsavaj" ],
			'unicode-escape' => [ '\\u006aavascript:alert(1)' ],
			'long'           => [ \str_repeat( 'X', 100000 ) . '<script>' ],
			'bad-utf8'       => [ "\xc3\x28<script>" ],
		];
	}

	/**
	 * All core renderers keep payloads in text or discard invalid typed values.
	 *
	 * @param string $hostile Attack string.
	 */
	#[DataProvider( 'hostile_strings' )]
	public function test_every_element_and_property_kind( string $hostile ): void {
		$manifest = \json_decode( (string) \file_get_contents( \dirname( __DIR__ ) . '/data/core-elements.json' ), true, 128, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- Test fixture.
		$media    = new class() implements MediaResolver {
			/** Return fixture raster media.
			 *
			 * @param int $id Attachment ID.
			 * @return array<string,mixed>
			 */
			public function resolve( int $id ): array {
				return [
					'url'    => 'https://example.test/a.png',
					'width'  => 12,
					'height' => 12,
					'alt'    => '',
				];
			}
		};
		$renderer = new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $media );
		foreach ( $manifest['elements'] as $definition ) {
			$props        = [];
			$translations = [];
			foreach ( $definition['props'] as $name => $property ) {
				if ( 'invariant' === $property['classification'] ) {
					$props[ $name ] = $hostile;
				} else {
					$translations[ $name ] = $hostile;
				}
			}
			$node     = (object) [
				'id'       => 'safe-1',
				'type'     => $definition['type'],
				'props'    => (object) $props,
				'children' => [],
			];
			$document = (object) [
				'root'          => [ $node ],
				'defaultLocale' => 'en_US',
				'translations'  => (object) [ 'en_US' => (object) [ 'safe-1' => (object) [ 'values' => (object) $translations ] ] ],
			];
			$html     = $renderer->render( $document, 'en_US', 'light', [ 'safe-1' => [ $hostile ] ] );
			$this->assertTrue( PreviewSanitizer::accepts( $html ), $definition['type'] );
			$this->assert_safe_dom( $html, $definition['type'] );
		}
	}

	/** Translated alt text and labels are escaped while hostile URLs are refused.
	 *
	 * @param string $hostile Attack string.
	 */
	#[DataProvider( 'hostile_strings' )]
	public function test_translated_alt_and_button_fields( string $hostile ): void {
		$media    = new class() implements MediaResolver {
			/** Return valid raster metadata.
			 *
			 * @param int $id Attachment ID.
			 * @return array{url:string,width:int,height:int,alt:string}
			 */
			public function resolve( int $id ): array {
				return [
					'url'    => 'https://example.test/a.png',
					'width'  => 12,
					'height' => 12,
					'alt'    => '',
				];
			}
		};
		$renderer = new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $media );
		$document = (object) [
			'root'          => [
				(object) [
					'id'       => 'img-1',
					'type'     => 'blixis/image',
					'props'    => (object) [ 'attachmentId' => 7 ],
					'children' => [],
				],
				(object) [
					'id'       => 'btn-1',
					'type'     => 'blixis/button',
					'props'    => (object) [],
					'children' => [],
				],
			],
			'defaultLocale' => 'en_US',
			'translations'  => (object) [
				'en_US' => (object) [
					'img-1' => (object) [ 'values' => (object) [ 'alt' => $hostile ] ],
					'btn-1' => (object) [
						'values' => (object) [
							'label' => $hostile,
							'href'  => $hostile,
						],
					],
				],
			],
		];
		$html     = $renderer->render( $document, 'en_US', 'light' );
		$this->assertTrue( PreviewSanitizer::accepts( $html ) );
		$this->assert_safe_dom( $html, 'blixis/image' );
		$this->assertStringContainsString( 'data-blx-type="blixis/button"', $html );
	}

	/** Hostile IDs and types cannot become tags, attributes or classes.
	 *
	 * @param string $hostile Attack string.
	 */
	#[DataProvider( 'hostile_strings' )]
	public function test_hostile_ids_and_types_fall_back( string $hostile ): void {
		$media    = new class() implements MediaResolver {
			/** No media for the fallback.
			 *
			 * @param int $id Attachment ID.
			 */
			public function resolve( int $id ): ?array {
				return null;
			}
		};
		$renderer = new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $media );
		foreach ( [
			(object) [
				'id'       => $hostile,
				'type'     => 'blixis/text',
				'children' => [],
			],
			(object) [
				'id'       => 'safe-1',
				'type'     => $hostile,
				'children' => [],
			],
		] as $node ) {
			$html = $renderer->render( (object) [ 'root' => [ $node ] ], 'en_US', 'light' );
			$this->assertSame( '<div data-blx-invalid></div>', $html );
			$this->assertTrue( PreviewSanitizer::accepts( $html ) );
		}
	}

	/**
	 * Inspect actual parsed tags, attributes and URL schemes independently of PreviewSanitizer.
	 *
	 * @param string $html Rendered fragment.
	 * @param string $type Expected element type.
	 */
	private function assert_safe_dom( string $html, string $type ): void {
		$dom      = new \DOMDocument();
		$previous = \libxml_use_internal_errors( true );
		try {
			$this->assertTrue( $dom->loadHTML( '<!doctype html><html><body>' . $html . '</body></html>', LIBXML_NONET ) );
		} finally {
			\libxml_clear_errors();
			\libxml_use_internal_errors( $previous );
		}
		foreach ( $dom->getElementsByTagName( '*' ) as $element ) {
			$this->assertContains( $element->{'tagName'}, [ 'html', 'body', 'head', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'img', 'div', 'section', 'header', 'footer', 'main', 'aside', 'nav', 'article' ] );
			foreach ( $element->attributes as $attribute ) {
				$this->assertFalse( \str_starts_with( \strtolower( $attribute->name ), 'on' ) );
				if ( 'class' === $attribute->name ) {
					foreach ( \explode( ' ', $attribute->value ) as $class ) {
						$this->assertMatchesRegularExpression( '/^(?:blx-button|blx-button--(?:solid|outline|link)|blx-(?:c-)?[0-9a-f]{12})$/D', $class );
					}
				}
				if ( \in_array( $attribute->name, [ 'href', 'src' ], true ) ) {
					$this->assertMatchesRegularExpression( '~^(?:https?:|mailto:|tel:|/|#|[^:/?#][^:]*$)~i', $attribute->value );
				}
			}
		}
		$this->assertStringContainsString( 'data-blx-type="' . $type . '"', $html );
	}
}
