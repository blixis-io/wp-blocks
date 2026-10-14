<?php
/**
 * A post in a list or on its own page.
 *
 * @package Blixis\Theme
 */

?>
<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
	<header class="entry-header">
		<?php if ( is_singular() ) : ?>
			<h1 class="entry-title"><?php the_title(); ?></h1>
		<?php else : ?>
			<h2 class="entry-title"><a href="<?php echo esc_url( (string) get_permalink() ); ?>" rel="bookmark"><?php the_title(); ?></a></h2>
		<?php endif; ?>
	</header>
	<div class="entry-content">
		<?php
		the_content();
		wp_link_pages();
		?>
	</div>
</article>
