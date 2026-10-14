<?php
/**
 * Local Builder class loader.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

\defined( 'ABSPATH' ) || exit;

/**
 * Maps Builder classes to src/ without a runtime Composer dependency.
 */
final class Autoloader {

	private const PREFIX = 'Blixis\\Builder\\';

	/**
	 * Resolve a Builder class name to its source file.
	 *
	 * @param string $class_name Fully qualified class name.
	 * @return string|null Source path, or null for a name outside this namespace.
	 */
	public static function file_for( string $class_name ): ?string {
		if ( 0 !== \strpos( $class_name, self::PREFIX ) ) {
			return null;
		}
		$relative = \substr( $class_name, \strlen( self::PREFIX ) );
		foreach ( \explode( '\\', $relative ) as $segment ) {
			if ( 1 !== \preg_match( '/^[A-Za-z_][A-Za-z0-9_]*$/D', $segment ) ) {
				return null;
			}
		}
		return \dirname( __DIR__ ) . '/src/' . \str_replace( '\\', '/', $relative ) . '.php';
	}

	/**
	 * Load one class if its mapped file exists.
	 *
	 * @param string $class_name Fully qualified class name.
	 * @return void
	 */
	public static function load( string $class_name ): void {
		$file = self::file_for( $class_name );
		if ( null !== $file && \is_file( $file ) ) {
			require_once $file;
		}
	}

	/** Register this loader once for the current request. */
	public static function register(): void {
		\spl_autoload_register( [ self::class, 'load' ] );
	}
}
