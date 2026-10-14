<?php
/**
 * Media policy and image rendering tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Media\MediaPolicy;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Render\CoreDocumentRenderer;
use Blixis\Builder\Render\MediaResolver;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Raster-only library images, rebuilt srcset/sizes and the alt text rules. */
final class MediaTest extends TestCase {
	/**
	 * Render one image element with the given resolver result and props.
	 *
	 * @param array<string, mixed>|null $media Resolver result.
	 * @param array<string, mixed>      $props Element props.
	 * @param string|null               $alt Translated alt text.
	 */
	private function render( ?array $media, array $props = [], ?string $alt = null ): string {
		$resolver = new class( $media ) implements MediaResolver {
			/**
			 * Hold the canned result.
			 *
			 * @param array<string, mixed>|null $media Result.
			 */
			public function __construct( private readonly ?array $media ) {}

			/**
			 * Return the canned result.
			 *
			 * @param int $attachment_id Attachment id.
			 * @return array{url:string,width:int,height:int,alt:string,srcset?:string,sizes?:string}|null
			 */
			public function resolve( int $attachment_id ): ?array {
				unset( $attachment_id );
				return $this->media; // @phpstan-ignore return.type
			}
		};
		$entries  = null === $alt ? new \stdClass() : [
			'img' => [
				'values' => [ 'alt' => $alt ],
			],
		];
		$document = \json_decode(
			(string) \json_encode(
				[
					'defaultLocale' => 'en_US',
					'root'          => [
						[
							'id'       => 'sec',
							'type'     => 'blixis/section',
							'props'    => [ 'tag' => 'section' ],
							'children' => [
								[
									'id'       => 'img',
									'type'     => 'blixis/image',
									'props'    => \array_merge( [ 'attachmentId' => 7 ], $props ),
									'children' => [],
								],
							],
						],
					],
					'translations'  => [ 'en_US' => $entries ],
				]
			)
		);
		$this->assertInstanceOf( \stdClass::class, $document );
		return ( new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $resolver ) )->render( $document, 'en_US', 'light' );
	}

	/** SVG and anything that is not a listed raster type is refused. */
	public function test_mime_allow_list(): void {
		foreach ( [ 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif' ] as $mime ) {
			$this->assertTrue( MediaPolicy::allows_mime( $mime ), $mime );
		}
		foreach ( [ 'image/svg+xml', 'image/svg', 'text/html', 'application/pdf', 'IMAGE/PNG', 'image/png; charset=x', '', 'image/*' ] as $mime ) {
			$this->assertFalse( MediaPolicy::allows_mime( $mime ), $mime );
		}
	}

	/** Only well-formed candidates survive and the value is rebuilt, not passed through. */
	public function test_srcset_is_rebuilt_from_validated_parts(): void {
		$this->assertSame( 'https://e.test/a-300.jpg 300w, https://e.test/a-600.jpg 600w', MediaPolicy::srcset( "https://e.test/a-300.jpg 300w,\n https://e.test/a-600.jpg   600w" ) );
		foreach ( [ '', 'https://e.test/a.jpg', 'https://e.test/a.jpg 2x', 'javascript:alert(1) 100w', 'https://e.test/a.jpg 100w, javascript:x 200w', 'https://e.test/a.jpg" onerror="x 100w', 'https://e.test/a.jpg 0w', 'https://e.test/a.jpg 100000w', 'https://e.test/a.jpg 100w 200w' ] as $bad ) {
			$this->assertNull( MediaPolicy::srcset( $bad ), $bad );
		}
		$many = \implode( ', ', \array_map( static fn ( int $n ): string => 'https://e.test/' . $n . '.jpg ' . $n . 'w', \range( 1, 17 ) ) );
		$this->assertNull( MediaPolicy::srcset( $many ) );
	}

	/** Sizes accept media conditions and nothing that could break out of an attribute. */
	public function test_sizes(): void {
		$this->assertSame( '(max-width: 600px) 100vw, 600px', MediaPolicy::sizes( '(max-width: 600px) 100vw, 600px' ) );
		foreach ( [ '', '" onload="x', '100vw;color:red', '<b>', \str_repeat( 'a', 201 ) ] as $bad ) {
			$this->assertNull( MediaPolicy::sizes( $bad ), $bad );
		}
	}

	/** The picker description never carries unvalidated srcset or sizes. */
	public function test_describe(): void {
		$described = MediaPolicy::describe(
			7,
			[
				'url'    => 'https://e.test/a.jpg',
				'width'  => 600,
				'height' => 400,
				'alt'    => 'Alt',
				'srcset' => 'javascript:x 1w',
				'sizes'  => '100vw',
			]
		);
		$this->assertSame(
			[
				'id'     => 7,
				'url'    => 'https://e.test/a.jpg',
				'width'  => 600,
				'height' => 400,
				'alt'    => 'Alt',
				'srcset' => null,
				'sizes'  => '100vw',
			],
			$described
		);
	}

	/** Responsive attributes appear only when valid, and sizes only together with srcset. */
	public function test_responsive_image_output(): void {
		$base = [
			'url'    => 'https://e.test/a.jpg',
			'width'  => 600,
			'height' => 400,
			'alt'    => 'Library alt',
		];
		$html = $this->render(
			$base + [
				'srcset' => 'https://e.test/a-300.jpg 300w, https://e.test/a.jpg 600w',
				'sizes'  => '(max-width: 600px) 100vw, 600px',
			]
		);
		$this->assertStringContainsString( 'srcset="https://e.test/a-300.jpg 300w, https://e.test/a.jpg 600w" sizes="(max-width: 600px) 100vw, 600px" width="600" height="400"', $html );
		$this->assertStringContainsString( 'alt="Library alt"', $html );
		$hostile = $this->render(
			$base + [
				'srcset' => 'https://e.test/a.jpg" onerror="x 100w',
				'sizes'  => '" onload="x',
			]
		);
		$this->assertStringNotContainsString( 'srcset', $hostile );
		$this->assertStringNotContainsString( 'sizes', $hostile );
		$this->assertStringNotContainsString( 'onerror', $hostile );
		$only_sizes = $this->render( $base + [ 'sizes' => '100vw' ] );
		$this->assertStringNotContainsString( 'sizes', $only_sizes );
	}

	/** Alt text: translated text wins, decorative means empty alt and a role, and a missing alt is flagged. */
	public function test_alt_text_rules(): void {
		$base = [
			'url'    => 'https://e.test/a.jpg',
			'width'  => 600,
			'height' => 400,
			'alt'    => 'Library alt',
		];
		$this->assertStringContainsString( 'alt="Translated &lt;alt&gt;"', $this->render( $base, [], 'Translated <alt>' ) );
		$decorative = $this->render( $base, [ 'decorative' => true ] );
		$this->assertStringContainsString( 'alt="" role="presentation"', $decorative );
		$this->assertStringNotContainsString( 'data-blx-alt-missing', $decorative );
		$missing = $this->render( [ 'alt' => '' ] + $base );
		$this->assertStringContainsString( 'alt=""', $missing );
		$this->assertStringContainsString( 'data-blx-alt-missing', $missing );
		$this->assertStringContainsString( 'data-blx-missing-media', $this->render( null ) );
	}
}
