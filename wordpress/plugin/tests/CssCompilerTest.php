<?php
/**
 * PHP compiler parity tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Css\Compiler;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Shared TypeScript/PHP compiler contract. */
final class CssCompilerTest extends TestCase {
	/** Every committed compile fixture and its exact CSS bytes and metadata. */
	public function test_compile_goldens(): void {
		$files = \glob( \dirname( __DIR__, 3 ) . '/tests/fixtures/compile/*.fixture.json' );
		$this->assertNotFalse( $files );
		$this->assertCount( 11, $files );
		foreach ( $files as $file ) {
			$fixture = \json_decode( (string) \file_get_contents( $file ), true, 512, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
			$input   = $fixture['input'];
			$result  = Compiler::compile( $input['document'], $input['classes'] ?? [], $input['tokens'] ?? [], $input['breakpoints'] ?? null );
			$golden  = \file_get_contents( \str_replace( '.fixture.json', '.golden.css', $file ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
			$this->assertSame( $golden, $result->css, $file );
			$actual   = $result->class_names;
			$expected = $fixture['expected']['classNames'];
			\ksort( $actual, SORT_STRING );
			\ksort( $expected, SORT_STRING );
			$this->assertSame( $expected, $actual, $file );
			$this->assertSame(
				$fixture['expected']['issues'],
				\array_map(
					static fn ( array $issue ): array => [
						'code' => $issue['code'],
						'path' => $issue['path'],
					],
					$result->issues
				),
				$file
			);
			$this->assertSame( $result->css, Compiler::compile( $input['document'], $input['classes'] ?? [], $input['tokens'] ?? [], $input['breakpoints'] ?? null )->css );
		}
	}
	/** Template layout props are lowered into the regular allowlisted responsive CSS compiler path. */
	public function test_template_layout_props_compile_to_responsive_css(): void {
		$document = [
			'documentId' => 'layout-test',
			'root'       => [
				[
					'id'       => 'grid-one',
					'type'     => 'grid',
					'props'    => [
						'columns'  => [
							'desktop' => 3,
							'tablet'  => 2,
							'mobile'  => 1,
						],
						'gapToken' => 'space-lg',
					],
					'children' => [],
				],
				[
					'id'       => 'columns-one',
					'type'     => 'columns',
					'props'    => [
						'ratios'  => [ 1, 2 ],
						'stackAt' => 'mobile',
					],
					'children' => [],
				],
				[
					'id'       => 'container-one',
					'type'     => 'container',
					'props'    => [ 'maxWidthToken' => 'container-wide' ],
					'children' => [],
				],
				[
					'id'       => 'header-one',
					'type'     => 'site-header',
					'props'    => [ 'sticky' => true ],
					'children' => [],
				],
			],
		];
		$result   = Compiler::compile( $document );
		$this->assertSame( [], $result->issues );
		$this->assertStringContainsString( 'gap:var(--blx-space-lg)', $result->css );
		$this->assertStringContainsString( 'grid-template-columns:repeat(3, minmax(0, 1fr))', $result->css );
		$this->assertStringContainsString( 'grid-template-columns:repeat(2, minmax(0, 1fr))', $result->css );
		$this->assertStringContainsString( 'grid-template-columns:1fr 2fr', $result->css );
		$this->assertStringContainsString( 'grid-template-columns:1fr', $result->css );
		$this->assertStringContainsString( 'max-width:var(--blx-container-wide)', $result->css );
		$this->assertStringContainsString( 'position:sticky;top:0', $result->css );
	}

	/** PHP and TypeScript emit the same mark CSS for the shared token set. */
	public function test_shared_rich_text_mark_css(): void {
		$root    = \dirname( __DIR__, 3 );
		$rich    = \json_decode( (string) \file_get_contents( $root . '/tests/fixtures/rich-text/cases.json' ), true, 512, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Shared fixture.
		$compile = \json_decode( (string) \file_get_contents( $root . '/tests/fixtures/compile/compile-tokens.fixture.json' ), true, 512, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Compile fixture.
		$result  = Compiler::compile( $compile['input']['document'], [], $rich['mark_css']['tokens'] );
		$this->assertStringContainsString( $rich['mark_css']['expected'], $result->css );
	}

	/** All style-resolution cases have regenerated TypeScript CSS as their byte oracle. */
	public function test_style_resolution_corpus(): void {
		$dir   = \dirname( __DIR__, 3 ) . '/tests/fixtures/compile-corpus';
		$files = \glob( $dir . '/*.json' );
		$this->assertNotFalse( $files );
		$this->assertGreaterThanOrEqual( 10, \count( $files ) );
		foreach ( $files as $file ) {
			$input  = \json_decode( (string) \file_get_contents( $file ), true, 512, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
			$result = Compiler::compile( $input['document'], $input['classes'] );
			$this->assertSame( \file_get_contents( \substr( $file, 0, -5 ) . '.css' ), $result->css, $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
		}
	}

	/** Distinguishes objects from lists and accepts both JSON decoding modes. */
	public function test_json_object_and_array_inputs(): void {
		$object = \json_decode( '{"documentId":"doc-001","root":[{"id":"el-a","children":[],"style":[{"declarations":{}}]}]}', false, 512, JSON_THROW_ON_ERROR );
		$array  = \json_decode( '{"documentId":"doc-001","root":[{"id":"el-a","children":[],"style":[{"declarations":[]}]}]}', true, 512, JSON_THROW_ON_ERROR );
		$this->assertSame( Compiler::compile( $object )->css, Compiler::compile( $array )->css );
		$this->assertSame( [], Compiler::compile( $object )->class_names );
	}

	/** Reordering elements and declaration keys does not change bytes. */
	public function test_order_independence(): void {
		$one                                        = [
			'documentId' => 'doc-001',
			'root'       => [
				[
					'id'       => 'el-a',
					'children' => [],
					'style'    => [
						[
							'declarations' => [
								'margin-top' => '1px',
								'margin'     => '0',
								'color'      => 'red',
							],
						],
					],
				],
				[
					'id'       => 'el-b',
					'children' => [],
					'style'    => [ [ 'declarations' => [ 'color' => 'blue' ] ] ],
				],
			],
		];
		$two                                        = $one;
		$two['root']                                = \array_reverse( $one['root'] );
		$two['root'][1]['style'][0]['declarations'] = [
			'color'      => 'red',
			'margin'     => '0',
			'margin-top' => '1px',
		];
		$this->assertSame( Compiler::compile( $one )->css, Compiler::compile( $two )->css );
	}

	/** Hostile identifiers and a forced hash collision become ordered issues. */
	public function test_hostile_inputs(): void {
		$node = static fn ( string $id ): array => [
			'id'       => $id,
			'children' => [],
			'style'    => [ [ 'declarations' => [ 'color' => 'red' ] ] ],
		];
		$doc  = [
			'documentId' => 'doc-001',
			'root'       => [ $node( 'el-a' ), $node( 'el-b' ) ],
		];
		$this->assertSame( [ 'hash-collision' ], \array_column( Compiler::compile( $doc, [], [], null, static fn (): string => 'aaaaaaaaaaaa' )->issues, 'code' ) );
		$doc['root'][0]['id'] = 'el-é';
		$this->assertSame( 'invalid-identifier', Compiler::compile( $doc )->issues[0]['code'] );
		$this->assertSame( 'invalid-breakpoints', Compiler::compile( $doc, [], [], [] )->issues[0]['code'] );
		$this->assertSame( '', Compiler::compile( $doc, [], [], [] )->css );
	}
}
