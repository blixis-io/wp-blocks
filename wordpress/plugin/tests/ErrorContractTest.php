<?php
/**
 * REST error code and documentation contract.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Rest\DocumentResult;
use Blixis\Builder\Rest\ErrorCatalog;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Every plugin error code has one status, one fixed message and a REST table row. */
final class ErrorContractTest extends TestCase {
	/** Source error literals and the catalog must agree. */
	public function test_all_plugin_error_codes_are_catalogued(): void {
		$files   = \glob( \dirname( __DIR__ ) . '/src/Rest/*.php' );
		$files   = false === $files ? [] : $files;
		$files[] = \dirname( __DIR__ ) . '/src/Publication/Publisher.php';
		$found   = [];
		foreach ( $files as $file ) {
			$source = (string) \file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test source scan.
			\preg_match_all( '/[\x27"](blixis_[a-z_]+)[\x27"]/', $source, $matches );
			foreach ( $matches[1] as $code ) {
				if ( 'blixis_builder_preview_renderer' !== $code ) {
					$found[ $code ] = true;
				}
			}
		}
		$this->assertSame( [], \array_diff( \array_keys( $found ), \array_keys( ErrorCatalog::ERRORS ) ) );
		$this->assertSame( [], \array_diff( \array_keys( ErrorCatalog::ERRORS ), \array_keys( $found ) ) );
	}

	/** The docs table itself lists each code with its exact status and fixed message. */
	public function test_rest_docs_table_lists_all_errors(): void {
		$markdown = (string) \file_get_contents( \dirname( __DIR__, 3 ) . '/docs/architecture/WORDPRESS.md' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test documentation scan.
		if ( 1 !== \preg_match( '/\| Status \| Code \| Cause \|\n\|[^\n]+\|\n((?:\|[^\n]+\|\n)+)/', $markdown, $match ) ) {
			self::fail( 'REST error table is missing.' );
		}
		$rows = [];
		foreach ( \explode( "\n", \trim( $match[1] ) ) as $line ) {
			$cells = \array_map( 'trim', \explode( '|', \trim( $line, '|' ) ) );
			if ( \count( $cells ) < 3 ) {
				continue;
			}
			if ( 1 === \preg_match( '/^`(blixis_[a-z_]+)`$/', $cells[1], $code ) ) {
				$rows[ $code[1] ] = [ (int) $cells[0], $cells[2] ];
			}
		}
		foreach ( ErrorCatalog::ERRORS as $code => [ $status, $message ] ) {
			$this->assertSame( [ $status, $message ], $rows[ $code ] ?? null, $code );
			$result = DocumentResult::error( $status, $code, 'ATTACKER-INPUT' );
			$this->assertSame( $message, $result->message );
		}
		$this->assertSame( [], \array_diff( \array_keys( $rows ), \array_keys( ErrorCatalog::ERRORS ) ) );
	}
}
