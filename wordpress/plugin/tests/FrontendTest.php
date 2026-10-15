<?php
/**
 * Published page reading, rendering and cache key tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Frontend\PageRenderer;
use Blixis\Builder\Frontend\PublishedReader;
use Blixis\Builder\Frontend\RenderCacheKey;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Render\CoreDocumentRenderer;
use Blixis\Builder\Render\MediaResolver;
use Blixis\Builder\Storage\FakeDatabase;
use Blixis\Builder\Storage\MetaKeys;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Drafts never reach the public page; published snapshots render; the cache key covers every input. */
final class FrontendTest extends TestCase {
	/**
	 * In-memory storage.
	 *
	 * @var FakeDatabase
	 */
	private FakeDatabase $database;

	/** Fresh storage per test. */
	protected function setUp(): void {
		$this->database = new FakeDatabase();
	}

	/**
	 * Store a row.
	 *
	 * @param string $key Meta key.
	 * @param mixed  $value JSON-encodable value.
	 */
	private function put( string $key, mixed $value ): void {
		$this->database->insert( 5, $key, \json_encode( $value, JSON_THROW_ON_ERROR ) );
	}

	/**
	 * Layout snapshot with one heading.
	 *
	 * @param int    $revision Snapshot number.
	 * @param string $id Element id.
	 */
	private function layout( int $revision, string $id = 'el-001' ): void {
		$this->put(
			MetaKeys::snap_layout( $revision ),
			[
				'schemaVersion'  => 1,
				'documentId'     => 'doc-001',
				'layoutRevision' => $revision,
				'root'           => [
					[
						'id'       => $id,
						'type'     => 'blixis/heading',
						'props'    => new \stdClass(),
						'children' => [],
						'style'    => [ [ 'declarations' => [ 'color' => 'red' ] ] ],
					],
				],
			]
		);
	}

	/**
	 * Content snapshot with a heading text.
	 *
	 * @param string $locale Locale.
	 * @param int    $revision Snapshot number.
	 * @param string $text Text.
	 * @param string $id Element id.
	 */
	private function content( string $locale, int $revision, string $text, string $id = 'el-001' ): void {
		$this->put(
			MetaKeys::snap_content( $locale, $revision ),
			[
				'schemaVersion'   => 1,
				'contentRevision' => $revision,
				'entries'         => [
					$id => [
						'status' => 'translated',
						'values' => [ 'text' => $text ],
					],
				],
			]
		);
	}

	/**
	 * Store the publication pointer.
	 *
	 * @param array<string, mixed> $extra Pointer fields.
	 */
	private function pointer( array $extra ): void {
		$this->put(
			MetaKeys::PUBLISHED,
			\array_merge(
				[
					'schemaVersion'   => 1,
					'pointerRevision' => 1,
				],
				$extra
			)
		);
	}

	/** A post without a pointer is not a builder page, even with working streams present. */
	public function test_working_streams_never_publish(): void {
		$this->put(
			MetaKeys::LAYOUT,
			[
				'schemaVersion'  => 1,
				'layoutRevision' => 1,
				'root'           => [],
			]
		);
		$this->assertNull( ( new PublishedReader( $this->database ) )->read( 5, 'en_US' ) );
		$this->assertNotContains( MetaKeys::LAYOUT, $this->database->read_keys, 'the working layout is never read' );
	}

	/** A pointer to a missing or invalid snapshot is null, never a partial page or the working layout. */
	public function test_missing_or_invalid_snapshot_is_not_published(): void {
		$this->put(
			MetaKeys::LAYOUT,
			[
				'schemaVersion'  => 1,
				'layoutRevision' => 1,
				'root'           => [],
			]
		);
		$this->pointer( [ 'publishedLayoutRevision' => 3 ] );
		$this->assertNull( ( new PublishedReader( $this->database ) )->read( 5, 'en_US' ) );
		$this->database->insert( 5, MetaKeys::snap_layout( 3 ), '{"schemaVersion":1,"layoutRevision":3,"root":"nope"}' );
		$this->assertNull( ( new PublishedReader( $this->database ) )->read( 5, 'en_US' ) );
	}

	/** The requested locale wins, the pointer's default locale is the fallback, and layout-only pointers still render. */
	public function test_locale_selection(): void {
		$this->layout( 2 );
		$this->content( 'en_US', 4, 'Hello' );
		$this->content( 'nl_NL', 6, 'Hallo' );
		$this->pointer(
			[
				'publishedLayoutRevision' => 2,
				'defaultLocale'           => 'en_US',
				'locales'                 => [
					'en_US' => [
						'contentSnapshot' => 4,
						'baseLayout'      => 2,
					],
					'nl_NL' => [
						'contentSnapshot' => 6,
						'baseLayout'      => 2,
					],
				],
			]
		);
		$reader = new PublishedReader( $this->database );
		$nl     = $reader->read( 5, 'nl_NL' );
		$fr     = $reader->read( 5, 'fr_FR' );
		$this->assertSame( [ 'nl_NL', 6, 2 ], [ $nl?->locale, $nl?->content_revision, $nl?->layout_revision ] );
		$this->assertSame( [ 'en_US', 4 ], [ $fr?->locale, $fr?->content_revision ] );
		$this->assertNull( $reader->read( 5, 'not a locale' ) );
		$this->assertNull( $reader->read( 0, 'en_US' ) );
	}

	/** Output is escaped, uses the selected locale's text and carries compiled CSS for the element class. */
	public function test_render_escapes_and_compiles(): void {
		$this->layout( 2 );
		$this->content( 'en_US', 4, '<b>Hi</b> & "you"' );
		$this->pointer(
			[
				'publishedLayoutRevision' => 2,
				'defaultLocale'           => 'en_US',
				'locales'                 => [
					'en_US' => [
						'contentSnapshot' => 4,
						'baseLayout'      => 2,
					],
				],
			]
		);
		$published = ( new PublishedReader( $this->database ) )->read( 5, 'en_US' );
		$this->assertNotNull( $published );
		$media = new class() implements MediaResolver {
			/**
			 * No media in this test.
			 *
			 * @param int $attachment_id Attachment id.
			 * @return array{url:string,width:int,height:int,alt:string}|null
			 */
			public function resolve( int $attachment_id ): ?array {
				unset( $attachment_id );
				return null;
			}
		};
		$page  = ( new PageRenderer( new CoreDocumentRenderer( ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), $media ) ) )->render( $published );
		$this->assertNotNull( $page );
		$this->assertStringContainsString( '&lt;b&gt;Hi&lt;/b&gt; &amp; &quot;you&quot;', $page['html'] );
		$this->assertStringNotContainsString( '<b>', $page['html'] );
		$this->assertStringStartsWith( '/*blx-css:1*/', $page['css'] );
		$this->assertStringContainsString( 'color:red', $page['css'] );
		// The element carries the generated class and the stylesheet targets exactly that class.
		$this->assertSame( 1, \preg_match( '/class="(blx-[0-9a-f]{12})"/', $page['html'], $match ) );
		$this->assertStringContainsString( '.' . ( $match[1] ?? 'missing' ) . '{color:red}', $page['css'] );
		$this->assertStringNotContainsString( '<', $page['css'] );
	}

	/** Every input is part of the cache key; the same inputs give the same key. */
	public function test_cache_key_covers_every_input(): void {
		$base = [ 5, 'en_US', 2, 4, 3, 'epoch-a', 1, '0.1.0', 'blixis@0.1.0', 'ok' ];
		$key  = static fn ( array $v ): string => RenderCacheKey::build( ...$v );
		$this->assertSame( $key( $base ), $key( $base ) );
		$this->assertMatchesRegularExpression( '/^blx_[0-9a-f]{64}$/D', $key( $base ) );
		foreach ( \array_keys( $base ) as $index ) {
			$changed           = $base;
			$changed[ $index ] = \is_int( $base[ $index ] ) ? $base[ $index ] + 1 : $base[ $index ] . 'x';
			$this->assertNotSame( $key( $base ), $key( $changed ), 'input #' . $index . ' must change the key' );
		}
	}
}
